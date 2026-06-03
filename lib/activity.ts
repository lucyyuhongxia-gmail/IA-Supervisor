import {
  formatMilestoneDueLabel,
  getMilestoneDueState,
} from "@/lib/milestone-status";
import { prisma } from "@/lib/prisma";
import { formatSubmissionStatus } from "@/lib/submissions";

export type ActivityItem = {
  id: string;
  title: string;
  description: string;
  timestamp: Date;
  href?: string;
  tone: "default" | "warning" | "success";
};

const activityLimit = 8;

export async function getTeacherActivity(teacherId: string) {
  const [versions, reviewedSlots, milestones] = await Promise.all([
    prisma.submissionVersion.findMany({
      where: {
        submissionSlot: {
          enrollment: {
            class: { teacherId, isArchived: false },
          },
        },
      },
      orderBy: { submittedAt: "desc" },
      take: activityLimit,
      include: {
        submissionSlot: {
          include: {
            criterion: true,
            enrollment: {
              include: {
                student: { select: { name: true } },
                class: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.submissionSlot.findMany({
      where: {
        reviewedAt: { not: null },
        enrollment: {
          class: { teacherId, isArchived: false },
        },
      },
      orderBy: { reviewedAt: "desc" },
      take: activityLimit,
      include: {
        criterion: true,
        enrollment: {
          include: {
            student: { select: { name: true } },
            class: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.milestone.findMany({
      where: {
        dueDate: { not: null },
        class: { teacherId, isArchived: false },
      },
      include: {
        class: { select: { id: true, name: true } },
        criterion: true,
      },
    }),
  ]);

  return [
    ...versions.map((version): ActivityItem => {
      const slot = version.submissionSlot;

      return {
        id: `teacher-version-${version.id}`,
        title: `${slot.enrollment.student.name} submitted Criterion ${slot.criterion.code}`,
        description: `${slot.enrollment.class.name} · v${version.versionNumber} · ${slot.criterion.title}`,
        timestamp: version.submittedAt,
        href: `/teacher/classes/${slot.enrollment.class.id}/students/${slot.enrollment.id}/criteria/${slot.criterion.id}`,
        tone: "default",
      };
    }),
    ...reviewedSlots.map((slot): ActivityItem => ({
      id: `teacher-review-${slot.id}-${slot.reviewedAt?.getTime() ?? ""}`,
      title: `Criterion ${slot.criterion.code} marked ${formatSubmissionStatus(slot.status)}`,
      description: `${slot.enrollment.student.name} · ${slot.enrollment.class.name}`,
      timestamp: slot.reviewedAt ?? slot.updatedAt,
      href: `/teacher/classes/${slot.enrollment.class.id}/students/${slot.enrollment.id}/criteria/${slot.criterion.id}`,
      tone:
        slot.status === "passed" || slot.status === "final_submitted"
          ? "success"
          : slot.status === "revision_needed"
            ? "warning"
            : "default",
    })),
    ...milestoneActivities(milestones, "teacher"),
  ]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, activityLimit);
}

export async function getStudentActivity(studentId: string) {
  const [versions, reviewedSlots, milestones] = await Promise.all([
    prisma.submissionVersion.findMany({
      where: {
        submissionSlot: {
          enrollment: { studentId },
        },
      },
      orderBy: { submittedAt: "desc" },
      take: activityLimit,
      include: {
        submissionSlot: {
          include: {
            criterion: true,
            enrollment: {
              include: {
                class: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.submissionSlot.findMany({
      where: {
        reviewedAt: { not: null },
        enrollment: { studentId },
      },
      orderBy: { reviewedAt: "desc" },
      take: activityLimit,
      include: {
        criterion: true,
        enrollment: {
          include: {
            class: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.milestone.findMany({
      where: {
        dueDate: { not: null },
        class: {
          enrollments: { some: { studentId } },
          isArchived: false,
        },
      },
      include: {
        class: { select: { id: true, name: true } },
        criterion: true,
      },
    }),
  ]);

  return [
    ...versions.map((version): ActivityItem => {
      const slot = version.submissionSlot;

      return {
        id: `student-version-${version.id}`,
        title: `You submitted Criterion ${slot.criterion.code}`,
        description: `${slot.enrollment.class.name} · v${version.versionNumber} · ${slot.criterion.title}`,
        timestamp: version.submittedAt,
        href: `/student/classes/${slot.enrollment.class.id}/criteria/${slot.criterion.id}`,
        tone: "default",
      };
    }),
    ...reviewedSlots.map((slot): ActivityItem => ({
      id: `student-review-${slot.id}-${slot.reviewedAt?.getTime() ?? ""}`,
      title: `Teacher marked Criterion ${slot.criterion.code} ${formatSubmissionStatus(slot.status)}`,
      description: `${slot.enrollment.class.name} · ${slot.criterion.title}`,
      timestamp: slot.reviewedAt ?? slot.updatedAt,
      href: `/student/classes/${slot.enrollment.class.id}/criteria/${slot.criterion.id}`,
      tone:
        slot.status === "passed" || slot.status === "final_submitted"
          ? "success"
          : slot.status === "revision_needed"
            ? "warning"
            : "default",
    })),
    ...milestoneActivities(milestones, "student"),
  ]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, activityLimit);
}

function milestoneActivities(
  milestones: Array<{
    id: string;
    title: string;
    dueDate: Date | null;
    class: { id: string; name: string };
    criterion: { id: string; code: string } | null;
  }>,
  audience: "teacher" | "student",
) {
  return milestones
    .map((milestone): ActivityItem | null => {
      const dueState = getMilestoneDueState(milestone.dueDate);

      if (dueState !== "overdue" && dueState !== "due_today" && dueState !== "due_soon") {
        return null;
      }

      const title =
        dueState === "overdue"
          ? `Milestone overdue: ${milestone.title}`
          : `Milestone due soon: ${milestone.title}`;
      const href =
        audience === "student" && milestone.criterion
          ? `/student/classes/${milestone.class.id}/criteria/${milestone.criterion.id}`
          : `/teacher/classes/${milestone.class.id}`;

      return {
        id: `${audience}-milestone-${milestone.id}`,
        title,
        description: `${milestone.class.name} · ${formatMilestoneDueLabel(milestone.dueDate)}`,
        timestamp: milestone.dueDate ?? new Date(),
        href,
        tone: dueState === "overdue" ? "warning" : "default",
      };
    })
    .filter((item): item is ActivityItem => Boolean(item));
}
