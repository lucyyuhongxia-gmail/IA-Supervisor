import type { SubmissionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const reviewQueueFilters = [
  { value: "active", label: "Active" },
  { value: "awaiting", label: "Awaiting" },
  { value: "under_review", label: "Under review" },
  { value: "revision_needed", label: "Needs revision" },
  { value: "passed", label: "Passed" },
  { value: "all", label: "All" },
] as const;

export type ReviewQueueFilter = (typeof reviewQueueFilters)[number]["value"];

export type ReviewQueueItemType = "criterion" | "deliverable";

export type ReviewQueueItem = {
  id: string;
  itemType: ReviewQueueItemType;
  classId: string;
  className: string;
  examSession: string;
  enrollmentId: string;
  studentName: string;
  studentEmail: string;
  reviewTitle: string;
  reviewContext: string;
  reviewDetail: string;
  criterionId?: string;
  criterionCode?: string;
  criterionTitle?: string;
  status: SubmissionStatus;
  versionNumber?: number;
  submittedAt: Date | null;
  aiReviewState:
    | "missing"
    | "current"
    | "stale"
    | "failed"
    | "pending"
    | "not_applicable";
  href: string;
};

export async function getTeacherReviewQueue(teacherId: string) {
  const classes = await prisma.class.findMany({
    where: { teacherId, isArchived: false },
    orderBy: { createdAt: "desc" },
    include: {
      enrollments: {
        include: {
          student: { select: { name: true, email: true } },
          submissionSlots: {
            include: {
              criterion: true,
              latestVersion: true,
              aiReviewRuns: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                  status: true,
                  submissionVersionId: true,
                },
              },
            },
          },
          deliverableSlots: {
            include: {
              latestVersion: true,
              deliverable: {
                include: {
                  criteria: {
                    include: { criterion: true },
                    orderBy: { criterion: { sortOrder: "asc" } },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  return classes
    .flatMap((classRecord) =>
      classRecord.enrollments.flatMap((enrollment) => {
        const criterionItems = enrollment.submissionSlots
          .filter((slot) => Boolean(slot.latestVersionId))
          .map((slot) => {
            const latestAIReviewRun = slot.aiReviewRuns[0];
            const reviewTitle = `Criterion ${slot.criterion.code}: ${slot.criterion.title}`;

            return {
              id: slot.id,
              itemType: "criterion" as const,
              classId: classRecord.id,
              className: classRecord.name,
              examSession: classRecord.examSession,
              enrollmentId: enrollment.id,
              studentName: enrollment.student.name,
              studentEmail: enrollment.student.email,
              reviewTitle,
              reviewContext: "Criterion document",
              reviewDetail: reviewTitle,
              criterionId: slot.criterion.id,
              criterionCode: slot.criterion.code,
              criterionTitle: slot.criterion.title,
              status: slot.status,
              versionNumber: slot.latestVersion?.versionNumber,
              submittedAt: slot.latestVersion?.submittedAt ?? slot.submittedAt,
              aiReviewState: getAIReviewQueueState(
                slot.latestVersionId,
                latestAIReviewRun,
              ),
              href: `/teacher/classes/${classRecord.id}/students/${enrollment.id}/criteria/${slot.criterion.id}`,
            };
          });

        const deliverableItems = enrollment.deliverableSlots.map((slot) => {
          const linkedCriteria = slot.deliverable.criteria
            .map((link) => `Criterion ${link.criterion.code}`)
            .join(", ");

          return {
            id: slot.id,
            itemType: "deliverable" as const,
            classId: classRecord.id,
            className: classRecord.name,
            examSession: classRecord.examSession,
            enrollmentId: enrollment.id,
            studentName: enrollment.student.name,
            studentEmail: enrollment.student.email,
            reviewTitle: slot.deliverable.title,
            reviewContext: "Deliverable",
            reviewDetail: linkedCriteria || "General deliverable",
            status: slot.status,
            versionNumber: slot.latestVersion?.versionNumber,
            submittedAt: slot.latestVersion?.submittedAt ?? slot.submittedAt,
            aiReviewState: "not_applicable" as const,
            href: `/teacher/classes/${classRecord.id}/students/${enrollment.id}/deliverables/${slot.deliverable.id}`,
          };
        });

        return [...criterionItems, ...deliverableItems];
      }),
    )
    .filter((item) =>
      [
        "submitted",
        "under_review",
        "revision_needed",
        "passed",
        "final_submitted",
      ].includes(item.status),
    )
    .sort(compareReviewQueueItems);
}

function compareReviewQueueItems(a: ReviewQueueItem, b: ReviewQueueItem) {
  const statusPriority =
    getReviewStatusPriority(a.status) - getReviewStatusPriority(b.status);
  if (statusPriority !== 0) {
    return statusPriority;
  }

  const aiPriority =
    getAIReviewPriority(a.aiReviewState) - getAIReviewPriority(b.aiReviewState);
  if (aiPriority !== 0) {
    return aiPriority;
  }

  const submittedAtPriority =
    (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0);
  if (submittedAtPriority !== 0) {
    return submittedAtPriority;
  }

  const classPriority = a.className.localeCompare(b.className);
  if (classPriority !== 0) {
    return classPriority;
  }

  const studentPriority = a.studentName.localeCompare(b.studentName);
  if (studentPriority !== 0) {
    return studentPriority;
  }

  return a.reviewTitle.localeCompare(b.reviewTitle);
}

function getReviewStatusPriority(status: SubmissionStatus) {
  switch (status) {
    case "submitted":
      return 0;
    case "under_review":
      return 1;
    case "revision_needed":
      return 2;
    case "passed":
      return 3;
    case "final_submitted":
      return 4;
    default:
      return 5;
  }
}

function getAIReviewPriority(state: ReviewQueueItem["aiReviewState"]) {
  switch (state) {
    case "failed":
    case "stale":
    case "missing":
      return 0;
    case "pending":
      return 1;
    case "current":
      return 2;
    case "not_applicable":
    default:
      return 3;
  }
}

function getAIReviewQueueState(
  latestVersionId: string | null,
  latestAIReviewRun:
    | {
        status: string;
        submissionVersionId: string | null;
      }
    | undefined,
): ReviewQueueItem["aiReviewState"] {
  if (!latestVersionId || !latestAIReviewRun) {
    return "missing";
  }

  if (latestAIReviewRun.submissionVersionId !== latestVersionId) {
    return "stale";
  }

  if (latestAIReviewRun.status === "completed") {
    return "current";
  }

  if (latestAIReviewRun.status === "failed") {
    return "failed";
  }

  return "pending";
}

export function getReviewQueueFilter(value: string | undefined): ReviewQueueFilter {
  const filter = reviewQueueFilters.find((item) => item.value === value);
  return filter?.value ?? "active";
}

export function matchesReviewQueueFilter(
  status: SubmissionStatus,
  filter: ReviewQueueFilter,
) {
  switch (filter) {
    case "awaiting":
      return status === "submitted";
    case "under_review":
      return status === "under_review";
    case "revision_needed":
      return status === "revision_needed";
    case "passed":
      return status === "passed" || status === "final_submitted";
    case "all":
      return true;
    case "active":
    default:
      return ["submitted", "under_review", "revision_needed"].includes(status);
  }
}
