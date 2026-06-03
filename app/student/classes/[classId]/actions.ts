"use server";

import type { SubmissionStatus, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit-log";
import { getCurrentUser } from "@/lib/current-user";
import { extractFileText } from "@/lib/file-extraction";
import { deleteStoredFile, saveUploadedFile } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { generateSemanticExtractionForSlot } from "@/lib/semantic-extraction";
import { studentWritableSourceStatuses } from "@/lib/submissions";

const updateSubmissionSchema = z.object({
  classId: z.string().min(1),
  slotId: z.string().min(1),
  notes: z.string().trim().max(1200).optional(),
});

const finalizeClassSchema = z.object({
  classId: z.string().min(1),
});

export type StudentSubmissionState = {
  error?: string;
  success?: string;
};

const minimumReadablePdfCharacters = 120;

export async function updateSubmissionSlotAction(
  _state: StudentSubmissionState,
  formData: FormData,
): Promise<StudentSubmissionState> {
  const user = await getCurrentUser();

  if (!user || user.role !== "student") {
    return { error: "Only student accounts can update submissions." };
  }

  const parsed = updateSubmissionSchema.safeParse({
    classId: formData.get("classId"),
    slotId: formData.get("slotId"),
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message ?? "Check the submission form.",
    };
  }

  const slot = await prisma.submissionSlot.findFirst({
    where: {
      id: parsed.data.slotId,
      enrollment: {
        studentId: user.id,
        classId: parsed.data.classId,
      },
    },
    select: { id: true, criterionId: true, status: true },
  });

  if (!slot) {
    return { error: "Submission slot not found." };
  }

  if (
    !(studentWritableSourceStatuses as readonly SubmissionStatus[]).includes(
      slot.status,
    )
  ) {
    return { error: "This submission is currently locked for student edits." };
  }

  const uploadedFile = formData.get("artifactFile");
  const hasUploadedFile = uploadedFile instanceof File && uploadedFile.size > 0;
  let fileAsset:
    | Awaited<ReturnType<typeof saveUploadedFile>>
    | null = null;

  if (hasUploadedFile) {
    try {
      fileAsset = await saveUploadedFile(uploadedFile);
      const validation = await validateReadablePdfUpload(fileAsset);

      if (!validation.valid) {
        await deleteStoredFile(fileAsset.storagePath);

        return {
          error: validation.message,
        };
      }
    } catch (error) {
      if (fileAsset) {
        await deleteStoredFile(fileAsset.storagePath).catch(() => null);
      }

      return {
        error:
          error instanceof Error
            ? error.message
            : "Could not save the uploaded file.",
      };
    }
  }

  if (hasUploadedFile) {
    const latestVersion = await prisma.submissionVersion.findFirst({
      where: { submissionSlotId: parsed.data.slotId },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;
    const submittedAt = new Date();

    await prisma.$transaction(async (tx) => {
      const version = await tx.submissionVersion.create({
        data: {
          submissionSlotId: parsed.data.slotId,
          versionNumber: nextVersionNumber,
          draftTitle: null,
          notes: parsed.data.notes ?? null,
          submittedAt,
          fileAssets: fileAsset
            ? {
                create: {
                  ...fileAsset,
                  submissionSlotId: parsed.data.slotId,
                  ownerId: user.id,
                },
              }
            : undefined,
        },
        select: { id: true },
      });

      await tx.submissionSlot.update({
        where: { id: parsed.data.slotId },
        data: {
          latestVersionId: version.id,
          draftTitle: null,
          artifactUrl: null,
          notes: null,
          status: "submitted",
          submittedAt,
          teacherFeedback: null,
          reviewedAt: null,
        },
      });

      await createAuditLog(
        {
          actorId: user.id,
          actorRole: user.role as UserRole,
          entityType: "submission_slot",
          entityId: parsed.data.slotId,
          action: "submission.version_submitted",
          fromState: slot.status,
          toState: "submitted",
          metadata: {
            classId: parsed.data.classId,
            criterionId: slot.criterionId,
            submissionVersionId: version.id,
            versionNumber: nextVersionNumber,
            fileName: uploadedFile.name,
            fileSizeBytes: uploadedFile.size,
          },
        },
        tx,
      );
    });

    await generateSemanticExtractionForSlot({
      slotId: parsed.data.slotId,
      actorId: user.id,
      actorRole: user.role as UserRole,
      classId: parsed.data.classId,
    }).catch(() => null);
  } else {
    await prisma.$transaction(async (tx) => {
      await tx.submissionSlot.update({
        where: { id: parsed.data.slotId },
        data: {
          notes: parsed.data.notes ?? null,
        },
      });

      await createAuditLog(
        {
          actorId: user.id,
          actorRole: user.role as UserRole,
          entityType: "submission_slot",
          entityId: parsed.data.slotId,
          action: "submission.note_saved",
          fromState: slot.status,
          toState: slot.status,
          metadata: {
            classId: parsed.data.classId,
            criterionId: slot.criterionId,
            noteLength: parsed.data.notes?.length ?? 0,
          },
        },
        tx,
      );
    });
  }

  revalidatePath(`/student/classes/${parsed.data.classId}`);
  revalidatePath(`/student/classes/${parsed.data.classId}/criteria/${slot.criterionId}`);
  revalidatePath("/student/dashboard");

  return {
    success: hasUploadedFile ? "Submission uploaded." : "Note saved.",
  };
}

async function validateReadablePdfUpload(
  fileAsset: Awaited<ReturnType<typeof saveUploadedFile>>,
) {
  const extraction = await extractFileText(fileAsset);

  if (
    extraction.status !== "success" ||
    extraction.characterCount < minimumReadablePdfCharacters
  ) {
    return {
      valid: false,
      message:
        "This PDF does not contain enough readable text. Please export your document as a text-based PDF and upload again.",
    };
  }

  return { valid: true };
}

export async function finalizeClassSubmissionAction(
  _state: StudentSubmissionState,
  formData: FormData,
): Promise<StudentSubmissionState> {
  const user = await getCurrentUser();

  if (!user || user.role !== "student") {
    return { error: "Only student accounts can finalize submissions." };
  }

  const parsed = finalizeClassSchema.safeParse({
    classId: formData.get("classId"),
  });

  if (!parsed.success) {
    return { error: "Class not found." };
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      classId: parsed.data.classId,
      studentId: user.id,
    },
    select: { id: true },
  });

  if (!enrollment) {
    return { error: "Enrollment not found." };
  }

  const classRecord = await prisma.class.findUnique({
    where: { id: parsed.data.classId },
    select: {
      subject: {
        select: {
          criteria: { select: { id: true, code: true } },
        },
      },
    },
  });

  if (!classRecord) {
    return { error: "Class not found." };
  }

  const slots = await prisma.submissionSlot.findMany({
    where: { enrollmentId: enrollment.id },
    select: {
      id: true,
      criterionId: true,
      status: true,
      latestVersionId: true,
    },
  });
  const slotsByCriterionId = new Map(slots.map((slot) => [slot.criterionId, slot]));
  const incompleteCriteria = classRecord.subject.criteria.filter((criterion) => {
    const slot = slotsByCriterionId.get(criterion.id);

    return (
      !slot ||
      !slot.latestVersionId ||
      (slot.status !== "passed" && slot.status !== "final_submitted")
    );
  });

  if (incompleteCriteria.length > 0) {
    return {
      error: `Final submission requires all criteria to be passed. Missing: ${incompleteCriteria
        .map((criterion) => criterion.code)
        .join(", ")}.`,
    };
  }

  const passedSlots = slots.filter((slot) => slot.status === "passed");

  await prisma.$transaction(async (tx) => {
    await tx.submissionSlot.updateMany({
      where: {
        enrollmentId: enrollment.id,
        status: "passed",
      },
      data: {
        status: "final_submitted",
      },
    });

    await Promise.all(
      passedSlots.map((slot) =>
        createAuditLog(
          {
            actorId: user.id,
            actorRole: user.role as UserRole,
            entityType: "submission_slot",
            entityId: slot.id,
            action: "submission.final_submitted",
            fromState: "passed",
            toState: "final_submitted",
            metadata: {
              classId: parsed.data.classId,
              enrollmentId: enrollment.id,
              criterionId: slot.criterionId,
              submissionVersionId: slot.latestVersionId,
            },
          },
          tx,
        ),
      ),
    );
  });

  revalidatePath(`/student/classes/${parsed.data.classId}`);
  revalidatePath("/student/dashboard");
  revalidatePath(`/teacher/classes/${parsed.data.classId}`);
  revalidatePath(`/teacher/classes/${parsed.data.classId}/analytics`);

  return { success: "Final IA submission locked." };
}
