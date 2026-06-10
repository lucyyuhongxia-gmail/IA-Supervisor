"use server";

import type { SubmissionStatus, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit-log";
import { runConsistencyReviewForEnrollment } from "@/lib/consistency-review";
import { getCurrentUser } from "@/lib/current-user";
import { runDeltaReviewForSlot } from "@/lib/delta-review";
import { extractFileText } from "@/lib/file-extraction";
import { runMarkingAssistantForSlot } from "@/lib/marking-assistant";
import { runAIReviewForSlot } from "@/lib/ai-review";
import { prisma } from "@/lib/prisma";
import {
  confirmSemanticExtraction,
  generateSemanticExtractionForSlot,
} from "@/lib/semantic-extraction";
import { teacherReviewStatuses } from "@/lib/submissions";

const updateTeacherFeedbackSchema = z.object({
  classId: z.string().min(1),
  slotId: z.string().min(1),
  status: z.enum(["submitted", "under_review", "revision_needed", "passed"]),
  teacherFeedback: z.string().trim().max(8000).optional(),
});

const updateDeliverableTeacherFeedbackSchema = z.object({
  classId: z.string().min(1),
  deliverableSlotId: z.string().min(1),
  status: z.enum(["submitted", "under_review", "revision_needed", "passed"]),
  teacherFeedback: z.string().trim().max(8000).optional(),
});

const reopenFinalSubmissionSchema = z.object({
  classId: z.string().min(1),
  slotId: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(5, "Enter a clear reason for reopening.")
    .max(1000, "Reason must be 1000 characters or fewer."),
});

const milestoneBaseSchema = z.object({
  classId: z.string().min(1),
  title: z.string().trim().min(2, "Enter a milestone title.").max(120),
  criterionId: z.string().trim().optional(),
  dueDate: z.string().trim().optional(),
  sortOrder: z.coerce.number().int().min(0).max(100),
});

const createMilestoneSchema = milestoneBaseSchema.omit({ sortOrder: true });

const updateMilestoneSchema = milestoneBaseSchema.extend({
  milestoneId: z.string().min(1),
});

const deleteMilestoneSchema = z.object({
  classId: z.string().min(1),
  milestoneId: z.string().min(1),
});

const runAIReviewSchema = z.object({
  classId: z.string().min(1),
  slotId: z.string().min(1),
});

const semanticExtractionSchema = z.object({
  classId: z.string().min(1),
  slotId: z.string().min(1),
});

const confirmSemanticExtractionSchema = z.object({
  classId: z.string().min(1),
  slotId: z.string().min(1),
  extractionId: z.string().min(1),
});

const runConsistencyReviewSchema = z.object({
  classId: z.string().min(1),
  enrollmentId: z.string().min(1),
});

const runMarkingAssistantSchema = z.object({
  classId: z.string().min(1),
  slotId: z.string().min(1),
});

const runDeltaReviewSchema = z.object({
  classId: z.string().min(1),
  slotId: z.string().min(1),
});

const saveFinalMarkSchema = z.object({
  classId: z.string().min(1),
  markingSnapshotId: z.string().min(1),
  teacherFinalMark: z.coerce.number().int().min(0),
  teacherFinalComment: z.string().trim().max(4000).optional(),
});

const aiReviewRunnableStatuses = new Set<SubmissionStatus>([
  "submitted",
  "under_review",
  "revision_needed",
  "passed",
]);

export type TeacherFeedbackState = {
  error?: string;
  success?: string;
};

export type ReopenFinalSubmissionState = {
  error?: string;
  success?: string;
};

export type AIReviewState = {
  error?: string;
  success?: string;
};

export type SemanticExtractionState = {
  error?: string;
  success?: string;
};

export type ConsistencyReviewState = {
  error?: string;
  success?: string;
};

export type MarkingAssistantState = {
  error?: string;
  success?: string;
};

export type DeltaReviewState = {
  error?: string;
  success?: string;
};

export type FinalMarkState = {
  error?: string;
  success?: string;
};

export async function updateTeacherFeedbackAction(
  _state: TeacherFeedbackState,
  formData: FormData,
): Promise<TeacherFeedbackState> {
  const user = await getCurrentUser();

  if (!user || user.role !== "teacher") {
    return { error: "Only teacher accounts can review submissions." };
  }

  const parsed = updateTeacherFeedbackSchema.safeParse({
    classId: formData.get("classId"),
    slotId: formData.get("slotId"),
    status: formData.get("status"),
    teacherFeedback: formData.get("teacherFeedback") || undefined,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message ?? "Check the review form.",
    };
  }

  if (
    !(teacherReviewStatuses as readonly SubmissionStatus[]).includes(
      parsed.data.status,
    )
  ) {
    return { error: "This status cannot be set by a teacher review." };
  }

  const slot = await prisma.submissionSlot.findFirst({
    where: {
      id: parsed.data.slotId,
      enrollment: {
        classId: parsed.data.classId,
        class: {
          teacherId: user.id,
        },
      },
    },
    select: {
      id: true,
      criterionId: true,
      enrollmentId: true,
      latestVersionId: true,
      status: true,
      teacherFeedback: true,
    },
  });

  if (!slot) {
    return { error: "Submission slot not found." };
  }

  if (slot.status === "final_submitted") {
    return {
      error:
        "Final-submitted criteria must be reopened with a reason before review status can change.",
    };
  }

  const reviewedAt = new Date();

  const nextFeedback = parsed.data.teacherFeedback ?? null;
  const trimmedFeedback = nextFeedback?.trim() ?? "";
  const shouldSendFeedback =
    parsed.data.status === "revision_needed" || parsed.data.status === "passed";

  if (shouldSendFeedback && !trimmedFeedback) {
    return {
      error:
        "Add feedback before sending a revision request or marking this criterion passed.",
    };
  }

  const studentVisibleFeedback = shouldSendFeedback
    ? trimmedFeedback
    : slot.teacherFeedback;

  await prisma.$transaction(async (tx) => {
    await tx.submissionSlot.update({
      where: { id: parsed.data.slotId },
      data: {
        status: parsed.data.status,
        teacherFeedback: studentVisibleFeedback,
        reviewedAt,
      },
    });

    if (slot.latestVersionId) {
      await tx.submissionVersion.update({
        where: { id: slot.latestVersionId },
        data: {
          teacherFeedback: studentVisibleFeedback,
          reviewedAt,
        },
      });

      if (trimmedFeedback) {
        if (shouldSendFeedback) {
          await tx.feedbackSnapshot.updateMany({
            where: {
              submissionVersionId: slot.latestVersionId,
              status: "sent",
            },
            data: {
              status: "superseded",
            },
          });

          const existingDraft = await tx.feedbackSnapshot.findFirst({
            where: {
              submissionVersionId: slot.latestVersionId,
              createdById: user.id,
              status: "draft",
            },
            orderBy: { updatedAt: "desc" },
            select: { id: true },
          });

          if (existingDraft) {
            await tx.feedbackSnapshot.update({
              where: { id: existingDraft.id },
              data: {
                status: "sent",
                content: trimmedFeedback,
                approvedAt: reviewedAt,
                sentAt: reviewedAt,
              },
            });
          } else {
            await tx.feedbackSnapshot.create({
              data: {
                submissionSlotId: parsed.data.slotId,
                submissionVersionId: slot.latestVersionId,
                createdById: user.id,
                status: "sent",
                content: trimmedFeedback,
                approvedAt: reviewedAt,
                sentAt: reviewedAt,
              },
            });
          }
        } else {
          const existingDraft = await tx.feedbackSnapshot.findFirst({
            where: {
              submissionVersionId: slot.latestVersionId,
              createdById: user.id,
              status: "draft",
            },
            orderBy: { updatedAt: "desc" },
            select: { id: true },
          });

          if (existingDraft) {
            await tx.feedbackSnapshot.update({
              where: { id: existingDraft.id },
              data: {
                content: trimmedFeedback,
              },
            });
          } else {
            await tx.feedbackSnapshot.create({
              data: {
                submissionSlotId: parsed.data.slotId,
                submissionVersionId: slot.latestVersionId,
                createdById: user.id,
                status: "draft",
                content: trimmedFeedback,
              },
            });
          }
        }
      }
    }

    if (slot.status !== parsed.data.status) {
      await createAuditLog(
        {
          actorId: user.id,
          actorRole: user.role as UserRole,
          entityType: "submission_slot",
          entityId: parsed.data.slotId,
          action: "review.status_changed",
          fromState: slot.status,
          toState: parsed.data.status,
          metadata: {
            classId: parsed.data.classId,
            enrollmentId: slot.enrollmentId,
            criterionId: slot.criterionId,
            submissionVersionId: slot.latestVersionId,
          },
        },
        tx,
      );
    }

    if ((slot.teacherFeedback ?? "") !== (nextFeedback ?? "")) {
      await createAuditLog(
        {
          actorId: user.id,
          actorRole: user.role as UserRole,
          entityType: "submission_slot",
          entityId: parsed.data.slotId,
          action: "review.feedback_saved",
          fromState: slot.status,
          toState: parsed.data.status,
          metadata: {
            classId: parsed.data.classId,
            enrollmentId: slot.enrollmentId,
            criterionId: slot.criterionId,
            submissionVersionId: slot.latestVersionId,
            feedbackLength: trimmedFeedback.length,
            feedbackSnapshotStatus: shouldSendFeedback ? "sent" : "draft",
          },
        },
        tx,
      );
    }
  });

  revalidatePath(`/teacher/classes/${parsed.data.classId}`);
  revalidatePath(`/teacher/classes/${parsed.data.classId}/students/${slot.enrollmentId}`);
  revalidatePath(`/teacher/classes/${parsed.data.classId}/students/${slot.enrollmentId}/criteria/${slot.criterionId}`);
  revalidatePath(`/student/classes/${parsed.data.classId}`);
  revalidatePath(`/student/classes/${parsed.data.classId}/criteria/${slot.criterionId}`);
  revalidatePath("/student/dashboard");

  return {
    success: shouldSendFeedback
      ? "Feedback sent to the student."
      : "Feedback saved as a teacher draft.",
  };
}

export async function updateDeliverableTeacherFeedbackAction(
  _state: TeacherFeedbackState,
  formData: FormData,
): Promise<TeacherFeedbackState> {
  const user = await getCurrentUser();

  if (!user || user.role !== "teacher") {
    return { error: "Only teacher accounts can review submissions." };
  }

  const parsed = updateDeliverableTeacherFeedbackSchema.safeParse({
    classId: formData.get("classId"),
    deliverableSlotId: formData.get("deliverableSlotId"),
    status: formData.get("status"),
    teacherFeedback: formData.get("teacherFeedback") || undefined,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message ?? "Check the review form.",
    };
  }

  if (
    !(teacherReviewStatuses as readonly SubmissionStatus[]).includes(
      parsed.data.status,
    )
  ) {
    return { error: "This status cannot be set by a teacher review." };
  }

  const slot = await prisma.deliverableSubmissionSlot.findFirst({
    where: {
      id: parsed.data.deliverableSlotId,
      enrollment: {
        classId: parsed.data.classId,
        class: {
          teacherId: user.id,
        },
      },
    },
    select: {
      id: true,
      deliverableId: true,
      enrollmentId: true,
      latestVersionId: true,
      status: true,
      teacherFeedback: true,
      deliverable: {
        select: {
          title: true,
          criteria: {
            select: {
              criterionId: true,
            },
          },
        },
      },
    },
  });

  if (!slot) {
    return { error: "Deliverable submission slot not found." };
  }

  if (slot.status === "final_submitted") {
    return {
      error:
        "Final-submitted deliverables must be reopened before review status can change.",
    };
  }

  const reviewedAt = new Date();
  const nextFeedback = parsed.data.teacherFeedback ?? null;
  const trimmedFeedback = nextFeedback?.trim() ?? "";
  const shouldSendFeedback =
    parsed.data.status === "revision_needed" || parsed.data.status === "passed";

  if (shouldSendFeedback && !trimmedFeedback) {
    return {
      error:
        "Add feedback before sending a revision request or marking this deliverable passed.",
    };
  }

  const studentVisibleFeedback = shouldSendFeedback
    ? trimmedFeedback
    : slot.teacherFeedback;

  await prisma.$transaction(async (tx) => {
    await tx.deliverableSubmissionSlot.update({
      where: { id: slot.id },
      data: {
        status: parsed.data.status,
        teacherFeedback: studentVisibleFeedback,
        reviewedAt,
      },
    });

    if (slot.latestVersionId) {
      await tx.deliverableSubmissionVersion.update({
        where: { id: slot.latestVersionId },
        data: {
          teacherFeedback: studentVisibleFeedback,
          reviewedAt,
        },
      });
    }

    if (slot.status !== parsed.data.status) {
      await createAuditLog(
        {
          actorId: user.id,
          actorRole: user.role as UserRole,
          entityType: "deliverable_submission_slot",
          entityId: slot.id,
          action: "deliverable_review.status_changed",
          fromState: slot.status,
          toState: parsed.data.status,
          metadata: {
            classId: parsed.data.classId,
            enrollmentId: slot.enrollmentId,
            deliverableId: slot.deliverableId,
            deliverableTitle: slot.deliverable.title,
            linkedCriterionIds: slot.deliverable.criteria.map(
              (link) => link.criterionId,
            ),
            deliverableSubmissionVersionId: slot.latestVersionId,
          },
        },
        tx,
      );
    }

    if ((slot.teacherFeedback ?? "") !== (nextFeedback ?? "")) {
      await createAuditLog(
        {
          actorId: user.id,
          actorRole: user.role as UserRole,
          entityType: "deliverable_submission_slot",
          entityId: slot.id,
          action: "deliverable_review.feedback_saved",
          fromState: slot.status,
          toState: parsed.data.status,
          metadata: {
            classId: parsed.data.classId,
            enrollmentId: slot.enrollmentId,
            deliverableId: slot.deliverableId,
            deliverableTitle: slot.deliverable.title,
            linkedCriterionIds: slot.deliverable.criteria.map(
              (link) => link.criterionId,
            ),
            deliverableSubmissionVersionId: slot.latestVersionId,
            feedbackLength: trimmedFeedback.length,
            feedbackSnapshotStatus: shouldSendFeedback ? "sent" : "draft",
          },
        },
        tx,
      );
    }
  });

  revalidatePath(`/teacher/classes/${parsed.data.classId}`);
  revalidatePath(`/teacher/classes/${parsed.data.classId}/students/${slot.enrollmentId}`);
  revalidatePath(
    `/teacher/classes/${parsed.data.classId}/students/${slot.enrollmentId}/deliverables/${slot.deliverableId}`,
  );
  revalidatePath(`/student/classes/${parsed.data.classId}`);
  revalidatePath(
    `/student/classes/${parsed.data.classId}/deliverables/${slot.deliverableId}`,
  );
  revalidatePath("/student/dashboard");

  return {
    success: shouldSendFeedback
      ? "Feedback sent to the student."
      : "Feedback saved as a teacher draft.",
  };
}

export async function reopenFinalSubmissionAction(
  _state: ReopenFinalSubmissionState,
  formData: FormData,
): Promise<ReopenFinalSubmissionState> {
  const user = await getCurrentUser();

  if (!user || user.role !== "teacher") {
    return { error: "Only teacher accounts can reopen final submissions." };
  }

  const parsed = reopenFinalSubmissionSchema.safeParse({
    classId: formData.get("classId"),
    slotId: formData.get("slotId"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message ?? "Check the reopen form.",
    };
  }

  const slot = await prisma.submissionSlot.findFirst({
    where: {
      id: parsed.data.slotId,
      enrollment: {
        classId: parsed.data.classId,
        class: {
          teacherId: user.id,
        },
      },
    },
    select: {
      id: true,
      criterionId: true,
      enrollmentId: true,
      latestVersionId: true,
      status: true,
    },
  });

  if (!slot) {
    return { error: "Submission slot not found." };
  }

  if (slot.status !== "final_submitted") {
    return { error: "Only final-submitted criteria can be reopened." };
  }

  if (!slot.latestVersionId) {
    return { error: "This criterion has no submitted version to reopen." };
  }

  const reopenedAt = new Date();
  const reason = parsed.data.reason.trim();
  const latestVersionId = slot.latestVersionId;

  await prisma.$transaction(async (tx) => {
    await tx.submissionSlot.update({
      where: { id: slot.id },
      data: {
        status: "revision_needed",
        teacherFeedback: reason,
        reviewedAt: reopenedAt,
      },
    });

    await tx.submissionVersion.update({
      where: { id: latestVersionId },
      data: {
        teacherFeedback: reason,
        reviewedAt: reopenedAt,
      },
    });

    await tx.feedbackSnapshot.updateMany({
      where: {
        submissionVersionId: latestVersionId,
        status: "sent",
      },
      data: {
        status: "superseded",
      },
    });

    await tx.feedbackSnapshot.create({
      data: {
        submissionSlotId: slot.id,
        submissionVersionId: latestVersionId,
        createdById: user.id,
        status: "sent",
        content: reason,
        approvedAt: reopenedAt,
        sentAt: reopenedAt,
      },
    });

    await createAuditLog(
      {
        actorId: user.id,
        actorRole: user.role as UserRole,
        entityType: "submission_slot",
        entityId: slot.id,
        action: "review.final_submission_reopened",
        fromState: "final_submitted",
        toState: "revision_needed",
        reason,
        metadata: {
          classId: parsed.data.classId,
          enrollmentId: slot.enrollmentId,
          criterionId: slot.criterionId,
          submissionVersionId: latestVersionId,
        },
      },
      tx,
    );
  });

  revalidatePath(`/teacher/classes/${parsed.data.classId}`);
  revalidatePath(`/teacher/classes/${parsed.data.classId}/analytics`);
  revalidatePath(`/teacher/classes/${parsed.data.classId}/students/${slot.enrollmentId}`);
  revalidatePath(`/teacher/classes/${parsed.data.classId}/students/${slot.enrollmentId}/report`);
  revalidatePath(
    `/teacher/classes/${parsed.data.classId}/students/${slot.enrollmentId}/criteria/${slot.criterionId}`,
  );
  revalidatePath(`/student/classes/${parsed.data.classId}`);
  revalidatePath(`/student/classes/${parsed.data.classId}/criteria/${slot.criterionId}`);
  revalidatePath("/teacher/dashboard");
  revalidatePath("/student/dashboard");

  return { success: "Final submission reopened for revision." };
}

export async function createMilestoneAction(formData: FormData) {
  const user = await getCurrentUser();

  if (!user || user.role !== "teacher") {
    throw new Error("Only teacher accounts can create milestones.");
  }

  const parsed = createMilestoneSchema.parse({
    classId: formData.get("classId"),
    title: formData.get("title"),
    criterionId: optionalFormString(formData.get("criterionId")),
    dueDate: optionalFormString(formData.get("dueDate")),
  });

  await assertTeacherOwnsClass(parsed.classId, user.id);
  await assertCriterionBelongsToClass(parsed.classId, parsed.criterionId);

  const lastMilestone = await prisma.milestone.findFirst({
    where: { classId: parsed.classId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await prisma.milestone.create({
    data: {
      classId: parsed.classId,
      title: parsed.title,
      criterionId: parsed.criterionId ?? null,
      dueDate: parseDateInput(parsed.dueDate),
      sortOrder: (lastMilestone?.sortOrder ?? 0) + 1,
    },
  });

  revalidateMilestoneViews(parsed.classId);
}

export async function updateMilestoneAction(formData: FormData) {
  const user = await getCurrentUser();

  if (!user || user.role !== "teacher") {
    throw new Error("Only teacher accounts can update milestones.");
  }

  const parsed = updateMilestoneSchema.parse({
    classId: formData.get("classId"),
    milestoneId: formData.get("milestoneId"),
    title: formData.get("title"),
    criterionId: optionalFormString(formData.get("criterionId")),
    dueDate: optionalFormString(formData.get("dueDate")),
    sortOrder: formData.get("sortOrder"),
  });

  await assertTeacherOwnsClass(parsed.classId, user.id);
  await assertCriterionBelongsToClass(parsed.classId, parsed.criterionId);

  await prisma.milestone.updateMany({
    where: {
      id: parsed.milestoneId,
      classId: parsed.classId,
    },
    data: {
      title: parsed.title,
      criterionId: parsed.criterionId ?? null,
      dueDate: parseDateInput(parsed.dueDate),
      sortOrder: parsed.sortOrder,
    },
  });

  revalidateMilestoneViews(parsed.classId);
}

export async function deleteMilestoneAction(formData: FormData) {
  const user = await getCurrentUser();

  if (!user || user.role !== "teacher") {
    throw new Error("Only teacher accounts can delete milestones.");
  }

  const parsed = deleteMilestoneSchema.parse({
    classId: formData.get("classId"),
    milestoneId: formData.get("milestoneId"),
  });

  await assertTeacherOwnsClass(parsed.classId, user.id);

  await prisma.milestone.deleteMany({
    where: {
      id: parsed.milestoneId,
      classId: parsed.classId,
    },
  });

  revalidateMilestoneViews(parsed.classId);
}

export async function runAIReviewAction(
  _state: AIReviewState,
  formData: FormData,
): Promise<AIReviewState> {
  const user = await getCurrentUser();

  if (!user || user.role !== "teacher") {
    return { error: "Only teacher accounts can run AI review." };
  }

  const parsed = runAIReviewSchema.safeParse({
    classId: formData.get("classId"),
    slotId: formData.get("slotId"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message ?? "Check the AI review request.",
    };
  }

  const slot = await prisma.submissionSlot.findFirst({
    where: {
      id: parsed.data.slotId,
      enrollment: {
        classId: parsed.data.classId,
        class: {
          teacherId: user.id,
        },
      },
    },
    select: {
      id: true,
      status: true,
      enrollmentId: true,
      criterionId: true,
      latestVersionId: true,
      latestVersion: {
        select: {
          fileAssets: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });

  if (!slot) {
    return { error: "Submission slot not found." };
  }

  if (!aiReviewRunnableStatuses.has(slot.status)) {
    return {
      error:
        "AI review can run only after a criterion has a submitted or reviewed version.",
    };
  }

  if (!slot.latestVersionId || !slot.latestVersion) {
    return { error: "A submitted version is required before AI review can run." };
  }

  const pdfFiles = slot.latestVersion.fileAssets.filter(isPdfFileAsset);

  if (pdfFiles.length === 0) {
    return { error: "A submitted PDF file is required before AI review can run." };
  }

  const extractionChecks = await Promise.all(
    pdfFiles.map((fileAsset) => extractFileText(fileAsset)),
  );
  const hasReadableText = extractionChecks.some(
    (extraction) =>
      extraction.status === "success" && extraction.characterCount >= 120,
  );

  if (!hasReadableText) {
    return {
      error:
        "AI review is blocked because the latest PDF does not contain enough readable text.",
    };
  }

  await generateSemanticExtractionForSlot({
    slotId: parsed.data.slotId,
    actorId: user.id,
    actorRole: user.role as UserRole,
    classId: parsed.data.classId,
  }).catch(() => null);

  const result = await runAIReviewForSlot({
    classId: parsed.data.classId,
    slotId: parsed.data.slotId,
    requestedById: user.id,
  });

  revalidatePath(`/teacher/classes/${parsed.data.classId}`);
  revalidatePath(`/teacher/classes/${parsed.data.classId}/students/${slot.enrollmentId}`);
  revalidatePath(
    `/teacher/classes/${parsed.data.classId}/students/${slot.enrollmentId}/criteria/${slot.criterionId}`,
  );
  revalidatePath("/teacher/dashboard");

  return result;
}

function isPdfFileAsset(fileAsset: { mimeType: string; originalName: string }) {
  return (
    fileAsset.mimeType === "application/pdf" ||
    fileAsset.originalName.toLowerCase().endsWith(".pdf")
  );
}

export async function generateSemanticExtractionAction(
  _state: SemanticExtractionState,
  formData: FormData,
): Promise<SemanticExtractionState> {
  const user = await getCurrentUser();

  if (!user || user.role !== "teacher") {
    return { error: "Only teacher accounts can generate semantic extraction." };
  }

  const parsed = semanticExtractionSchema.safeParse({
    classId: formData.get("classId"),
    slotId: formData.get("slotId"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message ?? "Check the extraction request.",
    };
  }

  const slot = await prisma.submissionSlot.findFirst({
    where: {
      id: parsed.data.slotId,
      enrollment: {
        classId: parsed.data.classId,
        class: {
          teacherId: user.id,
        },
      },
    },
    select: { id: true, criterionId: true, enrollmentId: true },
  });

  if (!slot) {
    return { error: "Submission slot not found." };
  }

  const result = await generateSemanticExtractionForSlot({
    slotId: parsed.data.slotId,
    actorId: user.id,
    actorRole: user.role as UserRole,
    classId: parsed.data.classId,
  });

  revalidatePath(
    `/teacher/classes/${parsed.data.classId}/students/${slot.enrollmentId}/criteria/${slot.criterionId}`,
  );

  return result.error ? { error: result.error } : { success: result.success };
}

export async function confirmSemanticExtractionAction(
  _state: SemanticExtractionState,
  formData: FormData,
): Promise<SemanticExtractionState> {
  const user = await getCurrentUser();

  if (!user || user.role !== "teacher") {
    return { error: "Only teacher accounts can confirm semantic extraction." };
  }

  const parsed = confirmSemanticExtractionSchema.safeParse({
    classId: formData.get("classId"),
    slotId: formData.get("slotId"),
    extractionId: formData.get("extractionId"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message ?? "Check the confirmation request.",
    };
  }

  const extraction = await prisma.semanticExtraction.findFirst({
    where: {
      id: parsed.data.extractionId,
      submissionSlotId: parsed.data.slotId,
      submissionSlot: {
        enrollment: {
          classId: parsed.data.classId,
          class: {
            teacherId: user.id,
          },
        },
      },
    },
    select: {
      id: true,
      submissionSlot: {
        select: {
          criterionId: true,
          enrollmentId: true,
        },
      },
    },
  });

  if (!extraction) {
    return { error: "Semantic extraction not found." };
  }

  const result = await confirmSemanticExtraction({
    extractionId: parsed.data.extractionId,
    actorId: user.id,
    actorRole: user.role as UserRole,
  });

  revalidatePath(
    `/teacher/classes/${parsed.data.classId}/students/${extraction.submissionSlot.enrollmentId}/criteria/${extraction.submissionSlot.criterionId}`,
  );

  return result.error ? { error: result.error } : { success: result.success };
}

export async function runConsistencyReviewAction(
  _state: ConsistencyReviewState,
  formData: FormData,
): Promise<ConsistencyReviewState> {
  const user = await getCurrentUser();

  if (!user || user.role !== "teacher") {
    return { error: "Only teacher accounts can run consistency review." };
  }

  const parsed = runConsistencyReviewSchema.safeParse({
    classId: formData.get("classId"),
    enrollmentId: formData.get("enrollmentId"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message ?? "Check the consistency review request.",
    };
  }

  const result = await runConsistencyReviewForEnrollment({
    classId: parsed.data.classId,
    enrollmentId: parsed.data.enrollmentId,
    requestedById: user.id,
    actorRole: user.role as UserRole,
  });

  revalidatePath(
    `/teacher/classes/${parsed.data.classId}/students/${parsed.data.enrollmentId}`,
  );

  return result.error ? { error: result.error } : { success: result.success };
}

export async function runMarkingAssistantAction(
  _state: MarkingAssistantState,
  formData: FormData,
): Promise<MarkingAssistantState> {
  const user = await getCurrentUser();

  if (!user || user.role !== "teacher") {
    return { error: "Only teacher accounts can run marking assistant." };
  }

  const parsed = runMarkingAssistantSchema.safeParse({
    classId: formData.get("classId"),
    slotId: formData.get("slotId"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message ?? "Check the marking request.",
    };
  }

  const slot = await prisma.submissionSlot.findFirst({
    where: {
      id: parsed.data.slotId,
      enrollment: {
        classId: parsed.data.classId,
        class: {
          teacherId: user.id,
        },
      },
    },
    select: {
      enrollmentId: true,
      criterionId: true,
    },
  });

  if (!slot) {
    return { error: "Submission slot not found." };
  }

  const result = await runMarkingAssistantForSlot({
    classId: parsed.data.classId,
    slotId: parsed.data.slotId,
    requestedById: user.id,
    actorRole: user.role as UserRole,
  });

  revalidatePath(
    `/teacher/classes/${parsed.data.classId}/students/${slot.enrollmentId}/criteria/${slot.criterionId}`,
  );

  return result.error ? { error: result.error } : { success: result.success };
}

export async function runDeltaReviewAction(
  _state: DeltaReviewState,
  formData: FormData,
): Promise<DeltaReviewState> {
  const user = await getCurrentUser();

  if (!user || user.role !== "teacher") {
    return { error: "Only teacher accounts can run delta review." };
  }

  const parsed = runDeltaReviewSchema.safeParse({
    classId: formData.get("classId"),
    slotId: formData.get("slotId"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message ?? "Check the delta review request.",
    };
  }

  const slot = await prisma.submissionSlot.findFirst({
    where: {
      id: parsed.data.slotId,
      enrollment: {
        classId: parsed.data.classId,
        class: {
          teacherId: user.id,
        },
      },
    },
    select: {
      enrollmentId: true,
      criterionId: true,
    },
  });

  if (!slot) {
    return { error: "Submission slot not found." };
  }

  const result = await runDeltaReviewForSlot({
    classId: parsed.data.classId,
    slotId: parsed.data.slotId,
    requestedById: user.id,
    actorRole: user.role as UserRole,
  });

  revalidatePath(
    `/teacher/classes/${parsed.data.classId}/students/${slot.enrollmentId}/criteria/${slot.criterionId}`,
  );

  return result.error ? { error: result.error } : { success: result.success };
}

export async function saveFinalMarkAction(
  _state: FinalMarkState,
  formData: FormData,
): Promise<FinalMarkState> {
  const user = await getCurrentUser();

  if (!user || user.role !== "teacher") {
    return { error: "Only teacher accounts can save final marks." };
  }

  const parsed = saveFinalMarkSchema.safeParse({
    classId: formData.get("classId"),
    markingSnapshotId: formData.get("markingSnapshotId"),
    teacherFinalMark: formData.get("teacherFinalMark"),
    teacherFinalComment: formData.get("teacherFinalComment") || undefined,
  });

  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message ?? "Check the final mark form.",
    };
  }

  const snapshot = await prisma.markingSnapshot.findFirst({
    where: {
      id: parsed.data.markingSnapshotId,
      submissionSlot: {
        enrollment: {
          classId: parsed.data.classId,
          class: {
            teacherId: user.id,
          },
        },
      },
    },
    include: {
      criterion: { select: { id: true, maxMarks: true } },
      submissionSlot: {
        select: {
          id: true,
          enrollmentId: true,
          criterionId: true,
          latestVersionId: true,
        },
      },
    },
  });

  if (!snapshot) {
    return { error: "Marking snapshot not found." };
  }

  if (snapshot.submissionSlot.latestVersionId !== snapshot.submissionVersionId) {
    return { error: "Final marks can only be saved on the latest version." };
  }

  if (parsed.data.teacherFinalMark > snapshot.criterion.maxMarks) {
    return {
      error: `Final mark must be between 0 and ${snapshot.criterion.maxMarks}.`,
    };
  }

  const finalMarkedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.markingSnapshot.update({
      where: { id: snapshot.id },
      data: {
        teacherFinalMark: parsed.data.teacherFinalMark,
        teacherFinalComment: parsed.data.teacherFinalComment ?? null,
        finalMarkedAt,
      },
    });

    await createAuditLog(
      {
        actorId: user.id,
        actorRole: user.role as UserRole,
        entityType: "submission_slot",
        entityId: snapshot.submissionSlot.id,
        action: "marking.final_mark_saved",
        toState: "final_mark_saved",
        metadata: {
          classId: parsed.data.classId,
          markingSnapshotId: snapshot.id,
          submissionVersionId: snapshot.submissionVersionId,
          criterionId: snapshot.criterionId,
          teacherFinalMark: parsed.data.teacherFinalMark,
          maxMarks: snapshot.criterion.maxMarks,
        },
      },
      tx,
    );
  });

  revalidatePath(
    `/teacher/classes/${parsed.data.classId}/students/${snapshot.submissionSlot.enrollmentId}/criteria/${snapshot.submissionSlot.criterionId}`,
  );

  return { success: "Final mark saved." };
}

async function assertTeacherOwnsClass(classId: string, teacherId: string) {
  const classRecord = await prisma.class.findFirst({
    where: {
      id: classId,
      teacherId,
    },
    select: { id: true },
  });

  if (!classRecord) {
    throw new Error("Class not found.");
  }
}

async function assertCriterionBelongsToClass(
  classId: string,
  criterionId: string | undefined,
) {
  if (!criterionId) {
    return;
  }

  const criterion = await prisma.criterionDef.findFirst({
    where: {
      id: criterionId,
      subject: {
        classes: {
          some: { id: classId },
        },
      },
    },
    select: { id: true },
  });

  if (!criterion) {
    throw new Error("Criterion does not belong to this class subject.");
  }
}

function parseDateInput(value: string | undefined) {
  if (!value) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day, 12);
}

function optionalFormString(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function revalidateMilestoneViews(classId: string) {
  revalidatePath(`/teacher/classes/${classId}`);
  revalidatePath(`/student/classes/${classId}`);
  revalidatePath("/student/dashboard");
}
