import type { Prisma, SubmissionStatus, UserRole } from "@prisma/client";

import { createAuditLog } from "@/lib/audit-log";

type SyncClient = Prisma.TransactionClient;

type SyncLinkedCriterionStatusesInput = {
  tx: SyncClient;
  classId: string;
  enrollmentId: string;
  criterionIds: string[];
  actorId: string;
  actorRole: UserRole;
};

const aggregateStatusPriority: SubmissionStatus[] = [
  "revision_needed",
  "under_review",
  "submitted",
  "draft",
];

export async function syncLinkedCriterionStatusesFromDeliverables({
  tx,
  classId,
  enrollmentId,
  criterionIds,
  actorId,
  actorRole,
}: SyncLinkedCriterionStatusesInput) {
  const uniqueCriterionIds = Array.from(new Set(criterionIds)).filter(Boolean);

  if (uniqueCriterionIds.length === 0) {
    return;
  }

  const deliverableSlots = await tx.deliverableSubmissionSlot.findMany({
    where: {
      enrollmentId,
      deliverable: {
        classId,
        isArchived: false,
        reviewMode: { not: "final_package" },
        criteria: {
          some: {
            criterionId: { in: uniqueCriterionIds },
          },
        },
      },
    },
    select: {
      id: true,
      status: true,
      teacherFeedback: true,
      reviewedAt: true,
      submittedAt: true,
      updatedAt: true,
      deliverableId: true,
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

  for (const criterionId of uniqueCriterionIds) {
    const relevantSlots = deliverableSlots.filter((slot) =>
      slot.deliverable.criteria.some((link) => link.criterionId === criterionId),
    );

    if (relevantSlots.length === 0) {
      continue;
    }

    const criterionSlot = await tx.submissionSlot.findUnique({
      where: {
        enrollmentId_criterionId: {
          enrollmentId,
          criterionId,
        },
      },
      select: {
        id: true,
        status: true,
        latestVersionId: true,
        teacherFeedback: true,
      },
    });

    if (!criterionSlot || criterionSlot.latestVersionId) {
      continue;
    }

    const nextStatus = aggregateDeliverableStatus(relevantSlots);
    const nextFeedback = getLatestStudentVisibleFeedback(relevantSlots);
    const shouldUpdateFeedback =
      nextStatus === "revision_needed" || nextStatus === "passed";
    const nextTeacherFeedback = shouldUpdateFeedback
      ? nextFeedback
      : criterionSlot.teacherFeedback;

    if (
      criterionSlot.status === nextStatus &&
      (criterionSlot.teacherFeedback ?? null) === (nextTeacherFeedback ?? null)
    ) {
      continue;
    }

    await tx.submissionSlot.update({
      where: { id: criterionSlot.id },
      data: {
        status: nextStatus,
        teacherFeedback: nextTeacherFeedback,
        reviewedAt:
          nextStatus === "revision_needed" || nextStatus === "passed"
            ? new Date()
            : null,
        submittedAt: getLatestSubmittedAt(relevantSlots),
      },
    });

    await createAuditLog(
      {
        actorId,
        actorRole,
        entityType: "submission_slot",
        entityId: criterionSlot.id,
        action: "criterion_status.synced_from_deliverables",
        fromState: criterionSlot.status,
        toState: nextStatus,
        metadata: {
          classId,
          enrollmentId,
          criterionId,
          linkedDeliverables: relevantSlots.map((slot) => ({
            deliverableId: slot.deliverableId,
            deliverableTitle: slot.deliverable.title,
            deliverableSubmissionSlotId: slot.id,
            status: slot.status,
          })),
        },
      },
      tx,
    );
  }
}

function aggregateDeliverableStatus(
  slots: Array<{ status: SubmissionStatus }>,
): SubmissionStatus {
  if (slots.length > 0 && slots.every((slot) => slot.status === "passed")) {
    return "passed";
  }

  const priorityStatus = aggregateStatusPriority.find((status) =>
    slots.some((slot) => slot.status === status),
  );

  if (priorityStatus) {
    return priorityStatus;
  }

  if (slots.some((slot) => slot.status === "passed")) {
    return "submitted";
  }

  return "not_started";
}

function getLatestStudentVisibleFeedback(
  slots: Array<{
    status: SubmissionStatus;
    teacherFeedback: string | null;
    reviewedAt: Date | null;
    submittedAt: Date | null;
    updatedAt: Date;
  }>,
) {
  return [...slots]
    .filter(
      (slot) =>
        (slot.status === "revision_needed" || slot.status === "passed") &&
        Boolean(slot.teacherFeedback?.trim()),
    )
    .sort((a, b) => getSlotTime(b) - getSlotTime(a))[0]
    ?.teacherFeedback?.trim() ?? null;
}

function getLatestSubmittedAt(
  slots: Array<{ submittedAt: Date | null; updatedAt: Date }>,
) {
  return [...slots].sort((a, b) => getSlotTime(b) - getSlotTime(a))[0]
    ?.submittedAt ?? null;
}

function getSlotTime(slot: {
  reviewedAt?: Date | null;
  submittedAt?: Date | null;
  updatedAt: Date;
}) {
  return (
    slot.reviewedAt?.getTime() ??
    slot.submittedAt?.getTime() ??
    slot.updatedAt.getTime()
  );
}
