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
    },
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Student workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">Dashboard</h1>
        </div>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </section>

      <Card>
        <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="lg:w-72">
            <CardTitle className="text-base">Join a class</CardTitle>
            <CardDescription className="mt-1">
              Enter the invite code provided by your teacher.
            </CardDescription>
          </div>
          <JoinClassForm />
        </CardContent>
      </Card>

      <section className="grid gap-4">
        <h2 className="text-lg font-semibold">My classes</h2>
        {enrollments.length > 0 ? (
          enrollments.map((enrollment) => {
            const sortedSlots = [...enrollment.submissionSlots].sort(
              (a, b) => a.criterion.sortOrder - b.criterion.sortOrder,
            );
            const statusSummary = getStatusSummary(
              sortedSlots.map((slot) => slot.status),
            );
            const nextMilestone = getNextActionMilestone(
              enrollment.class.milestones,
              sortedSlots,
            );
            const revisionSlots = sortedSlots.filter(
              (slot) => slot.status === "revision_needed",
            );

            return (
              <Card key={enrollment.id}>
                <CardHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="text-lg">{enrollment.class.name}</CardTitle>
                      <CardDescription>
                        {enrollment.class.subject.name} · {enrollment.class.examSession} ·{" "}
                        {enrollment.class.teacher.name}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {revisionSlots.length > 0 ? (
                    <div className="mb-5 grid gap-2 rounded-md border border-amber-200 bg-amber-50 p-4">
                      <p className="text-sm font-semibold text-amber-950">
                        Revisions requested
                      </p>
                      <div className="grid gap-2">
                        {revisionSlots.map((slot) => {
                          const feedback =
                            slot.latestVersion?.feedbackSnapshots[0]?.content ??
                            slot.latestVersion?.teacherFeedback ??
                            slot.teacherFeedback;

                          return (
                            <div
                              key={slot.id}
                              className="flex flex-col gap-2 rounded-md border border-amber-200 bg-white/70 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div>
                                <p className="font-medium">
                                  Criterion {slot.criterion.code}: {slot.criterion.title}
                                </p>
                                {feedback ? (
                                  <p className="mt-1 line-clamp-2 text-amber-900">
                                    {feedback}
                                  </p>
                                ) : (
                                  <p className="mt-1 text-amber-900">
                                    Teacher feedback is available on the criterion page.
                                  </p>
                                )}
                              </div>
                              <Button asChild size="sm">
                                <Link
                                  href={`/student/classes/${enrollment.class.id}/criteria/${slot.criterion.id}`}
                                >
                                  Revise
                                </Link>
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {nextMilestone ? (
                    <div className="mb-5 rounded-md border bg-muted/30 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-medium">Next action</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {nextMilestone.title}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatMilestoneDueLabel(nextMilestone.dueDate)}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:items-end">
                          <p
                            className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${getMilestoneDueTone(getMilestoneDueState(nextMilestone.dueDate))}`}
                          >
                            {formatMilestoneDueState(getMilestoneDueState(nextMilestone.dueDate))}
                          </p>
                          {nextMilestone.criterion ? (
                            <Button asChild size="sm">
                              <Link
                                href={`/student/classes/${enrollment.class.id}/criteria/${nextMilestone.criterion.id}`}
                              >
                                Open Criterion {nextMilestone.criterion.code}
                              </Link>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                    <div>
                      <p className="mb-2 text-sm font-medium">Criterion progress</p>
                      <div className="grid gap-2">
                        {sortedSlots.map((slot) => (
                          <div
                            key={slot.id}
                            className="flex flex-col gap-3 rounded-md border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-sm font-semibold">
                                {slot.criterion.code}
                              </span>
                              <div>
                                <p className="font-medium">Criterion {slot.criterion.code}</p>
                                <p
                                  className={`mt-1 inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${getStatusTone(slot.status)}`}
                                >
                                  {formatSubmissionStatus(slot.status)}
                                </p>
                              </div>
                            </div>
                            <Button
                              asChild
                              size="sm"
                              variant={slot.status === "revision_needed" ? "default" : "outline"}
                            >
                              <Link
                                href={`/student/classes/${enrollment.class.id}/criteria/${slot.criterion.id}`}
                              >
                                {slot.status === "revision_needed"
                                  ? `Revise ${slot.criterion.code}`
                                  : `Open Criterion ${slot.criterion.code}`}
                              </Link>
                            </Button>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 grid gap-3">
                        <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                          {statusSummary
                            .filter((item) => item.count > 0)
                            .map((item) => (
                              <div
                                key={item.status}
                                className={item.barClassName}
                                style={{
                                  width: `${(item.count / sortedSlots.length) * 100}%`,
                                }}
                              />
                            ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {statusSummary.map((item) => (
                            <div key={item.status} className="rounded-md border px-3 py-2">
                              <p className="text-lg font-semibold">{item.count}</p>
                              <p className="text-xs text-muted-foreground">{item.label}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-medium">Milestone timeline</p>
                      <div className="grid gap-2">
                        {enrollment.class.milestones.map((milestone) => {
                          const dueState = getMilestoneDueState(milestone.dueDate);

                          return (
                            <div
                              key={milestone.id}
                              className="grid gap-2 rounded-md border px-3 py-2 text-sm"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <p className="font-medium">{milestone.title}</p>
                                <p
                                  className={`inline-flex shrink-0 rounded-md border px-2 py-1 text-xs font-semibold ${getMilestoneDueTone(dueState)}`}
                                >
                                  {formatMilestoneDueState(dueState)}
                                </p>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {formatMilestoneDueLabel(milestone.dueDate)}
                              </p>
                              {milestone.criterion ? (
                                <p className="text-xs text-muted-foreground">
                                  Related to Criterion {milestone.criterion.code}
                                </p>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
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
