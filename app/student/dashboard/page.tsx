import Link from "next/link";
import type {
  CriterionDef,
  Milestone,
  SubmissionSlot,
  SubmissionStatus,
} from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/current-user";
import {
  formatMilestoneDueLabel,
  formatMilestoneDueState,
  getMilestoneDueState,
  getMilestoneDueTone,
} from "@/lib/milestone-status";
import { prisma } from "@/lib/prisma";
import {
  ensureEnrollmentSubmissionSlots,
  formatSubmissionStatus,
} from "@/lib/submissions";

import { JoinClassForm } from "./join-class-form";

export const dynamic = "force-dynamic";

type DashboardActionItem = {
  key: string;
  tone: "revision" | "milestone";
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  dueLabel: string | null;
};

export default async function StudentDashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    return <StudentAccessMessage title="Sign in required" description="Use a student account to join an IA class." />;
  }

  if (user.role !== "student") {
    return <StudentAccessMessage title="Student account required" description="This dashboard is reserved for student accounts." />;
  }

  const existingEnrollments = await prisma.enrollment.findMany({
    where: { studentId: user.id },
    select: { id: true, classId: true },
  });

  await Promise.all(
    existingEnrollments.map((enrollment) =>
      ensureEnrollmentSubmissionSlots({
        enrollmentId: enrollment.id,
        classId: enrollment.classId,
      }),
    ),
  );

  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: user.id },
    orderBy: { enrolledAt: "desc" },
    include: {
      class: {
        include: {
          subject: true,
          teacher: { select: { name: true, email: true } },
          milestones: {
            orderBy: { sortOrder: "asc" },
            include: {
              criterion: true,
            },
          },
        },
      },
      submissionSlots: {
        include: {
          criterion: true,
          latestVersion: {
            include: {
              feedbackSnapshots: {
                where: { status: "sent" },
                orderBy: { sentAt: "desc" },
                take: 1,
              },
            },
          },
        },
      },
      deliverableSlots: {
        include: {
          deliverable: {
            include: {
              criteria: {
                orderBy: { sortOrder: "asc" },
                include: {
                  criterion: true,
                },
              },
            },
          },
          latestVersion: true,
        },
      },
    },
  });

  const classViews = enrollments.map((enrollment) => {
    const sortedSlots = [...enrollment.submissionSlots].sort(
      (a, b) => a.criterion.sortOrder - b.criterion.sortOrder,
    );
    const sortedDeliverableSlots = [...enrollment.deliverableSlots].sort(
      (a, b) => a.deliverable.sortOrder - b.deliverable.sortOrder,
    );
    const progressSlots =
      sortedDeliverableSlots.length > 0 ? sortedDeliverableSlots : sortedSlots;
    const statusSummary = getStatusSummary(
      progressSlots.map((slot) => slot.status),
    );
    const nextMilestone = getNextActionMilestone(
      enrollment.class.milestones,
      sortedSlots,
    );
    const revisionSlots = sortedSlots.filter(
      (slot) => slot.status === "revision_needed",
    );

    return {
      enrollment,
      sortedSlots,
      sortedDeliverableSlots,
      statusSummary,
      nextMilestone,
      revisionSlots,
    };
  });

  const actionItems: DashboardActionItem[] = classViews.flatMap((classView) => {
    const revisionActions: DashboardActionItem[] = classView.revisionSlots.map((slot) => ({
      key: `revision-${slot.id}`,
      tone: "revision",
      eyebrow: "Revision needed",
      title: `Criterion ${slot.criterion.code}: ${slot.criterion.title}`,
      description: "Teacher feedback is ready. Revise the PDF and submit a new version.",
      href: `/student/classes/${classView.enrollment.class.id}/criteria/${slot.criterion.id}`,
      actionLabel: `Revise ${slot.criterion.code}`,
      dueLabel: null,
    }));

    if (revisionActions.length > 0 || !classView.nextMilestone) {
      return revisionActions;
    }

    return [
      {
        key: `milestone-${classView.nextMilestone.id}`,
        tone: "milestone" as const,
        eyebrow: formatMilestoneDueState(
          getMilestoneDueState(classView.nextMilestone.dueDate),
        ),
        title: classView.nextMilestone.title,
        description: classView.enrollment.class.name,
        href: classView.nextMilestone.criterion
          ? `/student/classes/${classView.enrollment.class.id}/criteria/${classView.nextMilestone.criterion.id}`
          : `/student/classes/${classView.enrollment.class.id}`,
        actionLabel: classView.nextMilestone.criterion
          ? `Open ${classView.nextMilestone.criterion.code}`
          : "Open class",
        dueLabel: formatMilestoneDueLabel(classView.nextMilestone.dueDate),
      },
    ];
  });

  const revisionCount = classViews.reduce(
    (count, classView) => count + classView.revisionSlots.length,
    0,
  );
  const submittedCount = classViews.reduce(
    (count, classView) =>
      count +
      classView.sortedSlots.filter(
        (slot) => slot.status === "submitted" || slot.status === "under_review",
      ).length,
    0,
  );
  const completedCount = classViews.reduce(
    (count, classView) =>
      count +
      classView.sortedSlots.filter(
        (slot) => slot.status === "passed" || slot.status === "final_submitted",
      ).length,
    0,
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Student workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">Dashboard</h1>
        </div>
        <div className="text-sm text-muted-foreground sm:text-right">
          <p>{user.email}</p>
          <p>{enrollments.length} active {enrollments.length === 1 ? "class" : "classes"}</p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        <DashboardMetric label="Classes" value={enrollments.length} />
        <DashboardMetric label="Needs revision" value={revisionCount} tone="amber" />
        <DashboardMetric label="Awaiting review" value={submittedCount} tone="blue" />
        <DashboardMetric label="Completed" value={completedCount} tone="emerald" />
      </section>

      <section className="grid gap-3">
        <div>
          <h2 className="text-lg font-semibold">Needs action</h2>
          <p className="text-sm text-muted-foreground">
            Items that need your attention now.
          </p>
        </div>
        {actionItems.length > 0 ? (
          <div className="grid gap-3">
            {actionItems.map((item) => (
              <div
                key={item.key}
                className={`flex flex-col gap-3 rounded-md border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${getActionItemTone(item.tone)}`}
              >
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {item.eyebrow}
                  </p>
                  <p className="mt-1 font-medium">{item.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.description}
                    {item.dueLabel ? ` · ${item.dueLabel}` : ""}
                  </p>
                </div>
                <Button asChild size="sm" variant={item.tone === "revision" ? "default" : "outline"}>
                  <Link href={item.href}>{item.actionLabel}</Link>
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground">
            No urgent revisions or due milestones right now.
          </div>
        )}
      </section>

      <details
        className="rounded-md border bg-card"
        open={enrollments.length === 0}
      >
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          {enrollments.length === 0 ? "Join a class" : "Join another class"}
        </summary>
        <div className="border-t p-4">
          <div className="grid gap-3 lg:grid-cols-[240px_1fr] lg:items-end">
            <p className="text-sm text-muted-foreground">
              Enter the invite code provided by your teacher.
            </p>
            <JoinClassForm />
          </div>
        </div>
      </details>

      <section className="grid gap-4">
        <div>
          <h2 className="text-lg font-semibold">My classes</h2>
          <p className="text-sm text-muted-foreground">
            Open one criterion at a time to submit or revise work.
          </p>
        </div>
        {classViews.length > 0 ? (
          classViews.map((classView) => {
            const { enrollment, sortedSlots, sortedDeliverableSlots, statusSummary } = classView;

            return (
              <Card key={enrollment.id}>
                <CardHeader className="p-4 pb-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <CardTitle className="text-lg">{enrollment.class.name}</CardTitle>
                      <CardDescription>
                        {enrollment.class.subject.name} · {enrollment.class.examSession} ·{" "}
                        {enrollment.class.teacher.name}
                      </CardDescription>
                    </div>
                    <div className="grid min-w-56 gap-2">
                      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                        {statusSummary
                          .filter((item) => item.count > 0)
                          .map((item) => (
                            <div
                              key={item.status}
                              className={item.barClassName}
                              style={{
                                width: `${(item.count / Math.max(sortedDeliverableSlots.length || sortedSlots.length, 1)) * 100}%`,
                              }}
                            />
                          ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {getClassProgressLabel(
                          statusSummary,
                          sortedDeliverableSlots.length || sortedSlots.length,
                        )}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 p-4 pt-0">
                  {sortedDeliverableSlots.length > 0 ? (
                    <div>
                      <p className="mb-2 text-sm font-medium">Submission plan</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {sortedDeliverableSlots.map((slot) => (
                          <Link
                            key={slot.id}
                            href={`/student/classes/${enrollment.class.id}/deliverables/${slot.deliverable.id}`}
                            className="rounded-md border px-3 py-2 text-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-medium">{slot.deliverable.title}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {slot.deliverable.criteria
                                    .map((link) => `Criterion ${link.criterion.code}`)
                                    .join(", ") || "General deliverable"}
                                </p>
                              </div>
                              <span
                                className={`inline-flex w-fit rounded-md border px-2 py-1 text-xs font-semibold ${getStatusTone(slot.status)}`}
                              >
                                {formatSubmissionStatus(slot.status)}
                              </span>
                            </div>
                            {slot.latestVersion ? (
                              <p className="mt-2 text-xs text-muted-foreground">
                                Latest v{slot.latestVersion.versionNumber} ·{" "}
                                {slot.latestVersion.submittedAt.toLocaleDateString()}
                              </p>
                            ) : null}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <p className="mb-2 text-sm font-medium">Criteria</p>
                    <div className="grid gap-2">
                      {sortedSlots.map((slot) => (
                        <Link
                          key={slot.id}
                          href={`/student/classes/${enrollment.class.id}/criteria/${slot.criterion.id}`}
                          className="flex flex-col gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold">
                              {slot.criterion.code}
                            </span>
                            <div>
                              <p className="font-medium">
                                Criterion {slot.criterion.code}: {slot.criterion.title}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {getCriterionHint(slot.status)}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`inline-flex w-fit rounded-md border px-2 py-1 text-xs font-semibold ${getStatusTone(slot.status)}`}
                          >
                            {formatSubmissionStatus(slot.status)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>

                  {enrollment.class.milestones.length > 0 ? (
                    <details className="rounded-md border bg-muted/20">
                      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                        Milestone timeline
                      </summary>
                      <div className="grid gap-2 border-t p-3">
                        {enrollment.class.milestones.map((milestone) => {
                          const dueState = getMilestoneDueState(milestone.dueDate);

                          return (
                            <div
                              key={milestone.id}
                              className="flex flex-col gap-2 rounded-md border bg-background px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div>
                                <p className="font-medium">{milestone.title}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {formatMilestoneDueLabel(milestone.dueDate)}
                                  {milestone.criterion
                                    ? ` · Criterion ${milestone.criterion.code}`
                                    : ""}
                                </p>
                              </div>
                              <p
                                className={`inline-flex w-fit shrink-0 rounded-md border px-2 py-1 text-xs font-semibold ${getMilestoneDueTone(dueState)}`}
                              >
                                {formatMilestoneDueState(dueState)}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  ) : null}
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">No classes yet</CardTitle>
              <CardDescription>
                Ask your teacher for an invite code to connect your IA class.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </section>
    </main>
  );
}

function DashboardMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "amber" | "blue" | "emerald";
}) {
  return (
    <div className={`rounded-md border px-3 py-2 ${getMetricTone(tone)}`}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function StudentAccessMessage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/login">Go to login</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function getNextActionMilestone(
  milestones: Array<
    Milestone & {
      criterion: CriterionDef | null;
    }
  >,
  slots: Array<SubmissionSlot & { criterion: CriterionDef }>,
) {
  const slotsByCriterionId = new Map(
    slots.map((slot) => [slot.criterionId, slot]),
  );
  const inactiveStatuses = new Set<SubmissionStatus>([
    "passed",
    "final_submitted",
    "under_review",
    "locked",
  ]);

  const actionableMilestones = milestones
    .filter((milestone) => milestone.criterion)
    .map((milestone) => ({
      milestone,
      slot: milestone.criterion
        ? slotsByCriterionId.get(milestone.criterion.id)
        : undefined,
      state: getMilestoneDueState(milestone.dueDate),
    }))
    .filter(
      ({ slot, state }) =>
        slot &&
        !inactiveStatuses.has(slot.status) &&
        ["overdue", "due_today", "due_soon", "upcoming"].includes(state),
    )
    .sort((a, b) => {
      const aTime = a.milestone.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bTime = b.milestone.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER;

      return aTime - bTime;
    });

  return actionableMilestones[0]?.milestone ?? null;
}

function getStatusTone(status: SubmissionStatus) {
  switch (status) {
    case "passed":
    case "final_submitted":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "submitted":
    case "under_review":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "revision_needed":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "locked":
      return "border-stone-200 bg-stone-50 text-stone-700";
    case "draft":
      return "border-zinc-200 bg-zinc-50 text-zinc-700";
    case "not_started":
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function getStatusSummary(statuses: SubmissionStatus[]) {
  const summary = [
    {
      status: "passed",
      label: "Passed",
      count: statuses.filter(
        (status) => status === "passed" || status === "final_submitted",
      ).length,
      barClassName: "bg-emerald-500",
    },
    {
      status: "submitted",
      label: "Submitted",
      count: statuses.filter(
        (status) => status === "submitted" || status === "under_review",
      ).length,
      barClassName: "bg-blue-500",
    },
    {
      status: "revision_needed",
      label: "Needs revision",
      count: statuses.filter((status) => status === "revision_needed").length,
      barClassName: "bg-amber-500",
    },
    {
      status: "not_started",
      label: "Not started",
      count: statuses.filter(
        (status) =>
          status === "not_started" || status === "draft" || status === "locked",
      ).length,
      barClassName: "bg-slate-300",
    },
  ];

  return summary;
}

function getMetricTone(tone: "default" | "amber" | "blue" | "emerald") {
  switch (tone) {
    case "amber":
      return "bg-amber-50";
    case "blue":
      return "bg-blue-50";
    case "emerald":
      return "bg-emerald-50";
    case "default":
    default:
      return "bg-card";
  }
}

function getActionItemTone(tone: "revision" | "milestone") {
  switch (tone) {
    case "revision":
      return "border-amber-200 bg-amber-50";
    case "milestone":
    default:
      return "bg-card";
  }
}

function getClassProgressLabel(
  statusSummary: ReturnType<typeof getStatusSummary>,
  totalSlots: number,
) {
  const passed =
    statusSummary.find((item) => item.status === "passed")?.count ?? 0;
  const submitted =
    statusSummary.find((item) => item.status === "submitted")?.count ?? 0;
  const needsRevision =
    statusSummary.find((item) => item.status === "revision_needed")?.count ?? 0;

  return `${passed} passed · ${submitted} awaiting review · ${needsRevision} needs revision · ${totalSlots} total`;
}

function getCriterionHint(status: SubmissionStatus) {
  switch (status) {
    case "revision_needed":
      return "Feedback is ready. Upload a revised PDF.";
    case "submitted":
      return "Submitted and waiting for teacher review.";
    case "under_review":
      return "Your teacher is reviewing this criterion.";
    case "passed":
      return "Accepted by your teacher.";
    case "final_submitted":
      return "Final submission is locked in.";
    case "draft":
      return "Draft work has not been submitted yet.";
    case "locked":
      return "This criterion is currently locked.";
    case "not_started":
    default:
      return "Open this criterion when you are ready to submit.";
  }
}
