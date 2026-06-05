"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit-log";
import { getCurrentUser } from "@/lib/current-user";
import { generateInviteCode } from "@/lib/invite-code";
import { defaultClassMilestones } from "@/lib/milestones";
import { prisma } from "@/lib/prisma";

export type CreateClassState = {
  error?: string;
};

const createClassSchema = z.object({
  name: z.string().trim().min(2, "Class name is required."),
  examSession: z.string().trim().min(2, "Exam session is required."),
  subjectId: z.string().trim().min(1, "Choose a subject."),
});

async function createUniqueInviteCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const inviteCode = generateInviteCode();
    const existing = await prisma.class.findUnique({
      where: { inviteCode },
      select: { id: true },
    });

    if (!existing) {
      return inviteCode;
    }
  }

  throw new Error("Could not generate a unique invite code.");
}

export async function createClassAction(
  _state: CreateClassState,
  formData: FormData,
): Promise<CreateClassState> {
  const user = await getCurrentUser();

  if (!user) {
    return { error: "Sign in as a teacher to create a class." };
  }

  if (user.role !== "teacher") {
    return { error: "Only teacher accounts can create classes." };
  }

  const parsed = createClassSchema.safeParse({
    name: formData.get("name"),
    examSession: formData.get("examSession"),
    subjectId: formData.get("subjectId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Check the class details." };
  }

  const subject = await prisma.subject.findUnique({
    where: { id: parsed.data.subjectId },
    select: {
      id: true,
      isArchived: true,
      criteria: {
        select: { id: true, code: true },
      },
      milestoneTemplates: {
        where: { isArchived: false },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          title: true,
          criterionId: true,
          criterion: { select: { code: true } },
          sortOrder: true,
        },
      },
      deliverableTemplates: {
        where: { isArchived: false },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          title: true,
          description: true,
          fileRequirement: true,
          reviewMode: true,
          sortOrder: true,
          criteria: {
            orderBy: { sortOrder: "asc" },
            select: {
              criterionId: true,
              sortOrder: true,
            },
          },
        },
      },
    },
  });

  if (!subject) {
    return { error: "Subject not found. Run the Prisma seed first." };
  }

  if (subject.isArchived) {
    return { error: "This subject is archived and cannot be used for new classes." };
  }

  const inviteCode = await createUniqueInviteCode();
  const criteriaByCode = new Map(
    subject.criteria.map((criterion) => [criterion.code, criterion.id]),
  );
  const milestoneTemplates =
    subject.milestoneTemplates.length > 0
      ? subject.milestoneTemplates.map((template, index) => ({
          title: template.title,
          sortOrder: template.sortOrder || index + 1,
          criterionId:
            template.criterionId ??
            (template.criterion?.code
              ? criteriaByCode.get(template.criterion.code)
              : undefined),
        }))
      : defaultClassMilestones.map((milestone, index) => ({
          title: milestone.title,
          sortOrder: index + 1,
          criterionId: milestone.criterionCode
            ? criteriaByCode.get(milestone.criterionCode)
            : undefined,
        }));
  const deliverableTemplates = subject.deliverableTemplates.map(
    (template, index) => ({
      sourceTemplateId: template.id,
      title: template.title,
      description: template.description,
      fileRequirement: template.fileRequirement,
      reviewMode: template.reviewMode,
      sortOrder: template.sortOrder || index + 1,
      criteria: {
        create: template.criteria.map((link, linkIndex) => ({
          criterionId: link.criterionId,
          sortOrder: link.sortOrder || linkIndex + 1,
        })),
      },
    }),
  );
  const classRecord = await prisma.$transaction(async (tx) => {
    const createdClass = await tx.class.create({
      data: {
        name: parsed.data.name,
        examSession: parsed.data.examSession,
        inviteCode,
        subjectId: subject.id,
        teacherId: user.id,
        milestones: {
          create: milestoneTemplates,
        },
        deliverables: {
          create: deliverableTemplates,
        },
      },
      select: { id: true },
    });

    await createAuditLog(
      {
        actorId: user.id,
        actorRole: "teacher",
        entityType: "class",
        entityId: createdClass.id,
        action: "class.created",
        toState: "created",
        metadata: {
          subjectId: subject.id,
          examSession: parsed.data.examSession,
          milestoneCount: milestoneTemplates.length,
          deliverableCount: deliverableTemplates.length,
        },
      },
      tx,
    );

    return createdClass;
  });

  revalidatePath("/teacher/dashboard");
  redirect(`/teacher/classes/${classRecord.id}`);
}
