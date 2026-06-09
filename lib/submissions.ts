import type { SubmissionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const editableSubmissionStatuses = [
  "draft",
  "submitted",
] as const satisfies readonly SubmissionStatus[];

export const teacherVisibleSubmissionStatuses = [
  "not_started",
  "draft",
  "submitted",
  "under_review",
  "revision_needed",
  "passed",
  "final_submitted",
  "locked",
] as const satisfies readonly SubmissionStatus[];

export const teacherReviewStatuses = [
  "submitted",
  "under_review",
  "revision_needed",
  "passed",
] as const satisfies readonly SubmissionStatus[];

export const studentWritableSourceStatuses = [
  "not_started",
  "draft",
  "submitted",
  "revision_needed",
] as const satisfies readonly SubmissionStatus[];

export function formatSubmissionStatus(status: SubmissionStatus) {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export async function ensureClassDeliverables(classId: string) {
  const classRecord = await prisma.class.findUnique({
    where: { id: classId },
    select: {
      subjectId: true,
      deliverables: {
        where: { sourceTemplateId: { not: null } },
        select: { sourceTemplateId: true },
      },
    },
  });

  if (!classRecord) {
    return;
  }

  const existingTemplateIds = new Set(
    classRecord.deliverables
      .map((deliverable) => deliverable.sourceTemplateId)
      .filter((templateId): templateId is string => Boolean(templateId)),
  );
  const missingTemplates = await prisma.subjectDeliverableTemplate.findMany({
    where: {
      subjectId: classRecord.subjectId,
      isArchived: false,
      id: { notIn: Array.from(existingTemplateIds) },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      criteria: {
        orderBy: { sortOrder: "asc" },
        select: {
          criterionId: true,
          sortOrder: true,
        },
      },
    },
  });

  await Promise.all(
    missingTemplates.map((template, templateIndex) =>
      prisma.classDeliverable.upsert({
        where: {
          classId_sourceTemplateId: {
            classId,
            sourceTemplateId: template.id,
          },
        },
        update: {},
        create: {
          classId,
          sourceTemplateId: template.id,
          title: template.title,
          description: template.description,
          fileRequirement: template.fileRequirement,
          reviewMode: template.reviewMode,
          sortOrder: template.sortOrder || templateIndex + 1,
          criteria: {
            create: template.criteria.map((link, linkIndex) => ({
              criterionId: link.criterionId,
              sortOrder: link.sortOrder || linkIndex + 1,
            })),
          },
        },
      }),
    ),
  );
}

export async function ensureEnrollmentSubmissionSlots({
  enrollmentId,
  classId,
  syncClassDeliverables = true,
}: {
  enrollmentId: string;
  classId: string;
  syncClassDeliverables?: boolean;
}) {
  if (syncClassDeliverables) {
    await ensureClassDeliverables(classId);
  }

  const classRecord = await prisma.class.findUnique({
    where: { id: classId },
    select: {
      subjectId: true,
      deliverables: {
        where: { isArchived: false },
        select: { id: true },
      },
    },
  });

  if (!classRecord) {
    return;
  }

  const criteria = await prisma.criterionDef.findMany({
    where: { subjectId: classRecord.subjectId },
    select: { id: true },
  });

  await Promise.all([
    ...criteria.map((criterion) =>
      prisma.submissionSlot.upsert({
        where: {
          enrollmentId_criterionId: {
            enrollmentId,
            criterionId: criterion.id,
          },
        },
        update: {},
        create: {
          enrollmentId,
          criterionId: criterion.id,
        },
      }),
    ),
    ...classRecord.deliverables.map((deliverable) =>
      prisma.deliverableSubmissionSlot.upsert({
        where: {
          enrollmentId_deliverableId: {
            enrollmentId,
            deliverableId: deliverable.id,
          },
        },
        update: {},
        create: {
          enrollmentId,
          deliverableId: deliverable.id,
        },
      }),
    ),
  ]);
}

export async function ensureClassSubmissionSlots(classId: string) {
  await ensureClassDeliverables(classId);

  const enrollments = await prisma.enrollment.findMany({
    where: { classId },
    select: { id: true },
  });

  await Promise.all(
    enrollments.map((enrollment) =>
      ensureEnrollmentSubmissionSlots({
        enrollmentId: enrollment.id,
        classId,
        syncClassDeliverables: false,
      }),
    ),
  );
}
