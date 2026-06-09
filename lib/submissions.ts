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

export async function ensureEnrollmentSubmissionSlots({
  enrollmentId,
  classId,
}: {
  enrollmentId: string;
  classId: string;
}) {
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
  const enrollments = await prisma.enrollment.findMany({
    where: { classId },
    select: { id: true },
  });

  await Promise.all(
    enrollments.map((enrollment) =>
      ensureEnrollmentSubmissionSlots({
        enrollmentId: enrollment.id,
        classId,
      }),
    ),
  );
}
