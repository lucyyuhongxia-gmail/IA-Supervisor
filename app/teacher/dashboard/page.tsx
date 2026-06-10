import Link from "next/link";
import type { SubmissionStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTeacherActivity, type ActivityItem } from "@/lib/activity";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import {
  getReviewQueueFilter,
  getTeacherReviewQueue,
  matchesReviewQueueFilter,
  reviewQueueFilters,
} from "@/lib/review-queue";

import { CreateClassForm } from "./create-class-form";

export const dynamic = "force-dynamic";

export default async function TeacherDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string }>;
}) {
  const user = await getCurrentUser();
  const { queue } = await searchParams;

  if (!user) {
    return <TeacherAccessMessage title="Sign in required" description="Use a teacher account to create and manage IA classes." />;
  }

  if (user.role !== "teacher") {
    return <TeacherAccessMessage title="Teacher account required" description="This dashboard is reserved for teacher accounts." />;
  }

  const [subjects, classes, reviewQueueItems, activityItems] = await Promise.all([
    prisma.subject.findMany({
      where: { isArchived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.class.findMany({
      where: { teacherId: user.id, isArchived: false },
      orderBy: { createdAt: "desc" },
      include: {
        subject: true,
        enrollments: {
          include: {
            student: { select: { name: true, email: true } },
            submissionSlots: {
              include: {
                criterion: true,
                latestVersion: true,
              },
            },
          },
        },
        milestones: { select: { id: true } },
      },
    }),
    getTeacherReviewQueue(user.id),
    getTeacherActivity(user.id),
  ]);

  const studentCount = classes.reduce(
    (total, classRecord) => total + classRecord.enrollments.length,
    0,
  );
  const milestoneCount = classes.reduce(
    (total, classRecord) => total + classRecord.milestones.length,
    0,
  );
  const activeQueueFilter = getReviewQueueFilter(queue);
  const filteredReviewQueueItems = reviewQueueItems.filter((item) =>
    matchesReviewQueueFilter(item.status, activeQueueFilter),
  );
  const awaitingReviewCount = reviewQueueItems.filter(
    (item) => item.status === "submitted" || item.status === "under_review",
  ).length;
  const revisionNeededCount = reviewQueueItems.filter(
    (item) => item.status === "revision_needed",
  ).length;
  const passedCount = reviewQueueItems.filter(
    (item) => item.status === "passed" || item.status === "final_submitted",
  ).length;
  const needsAIReviewCount = reviewQueueItems.filter((item) =>
    ["missing", "stale", "failed"].includes(item.aiReviewState),
  ).length;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Teacher workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">Dashboard</h1>
        </div>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </section>

      <div className="flex flex-wrap gap-2 rounded-md border bg-card px-3 py-2 text-sm">
        <MetricPill label="Classes" value={classes.length} />
        <MetricPill label="Awaiting review" value={awaitingReviewCount} />
        <MetricPill label="Needs revision" value={revisionNeededCount} />
        <MetricPill label="Passed" value={passedCount} />
        <MetricPill label="Needs AI review" value={needsAIReviewCount} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-lg">Review queue</CardTitle>
              <CardDescription>
                Cross-class submissions that need teacher attention.
              </CardDescription>
            </div>
            <div className="text-sm text-muted-foreground">
              {studentCount} students · {milestoneCount} milestones
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap gap-2">
            {reviewQueueFilters.map((filter) => (
              <Button
                key={filter.value}
                asChild
                size="sm"
                variant={activeQueueFilter === filter.value ? "default" : "outline"}
              >
                <Link href={filter.value === "active" ? "/teacher/dashboard" : `/teacher/dashboard?queue=${filter.value}`}>
                  {filter.label}
                </Link>
              </Button>
            ))}
          </div>
          {filteredReviewQueueItems.length > 0 ? (
            <div className="grid gap-3">
              {filteredReviewQueueItems.map((item) => (
                <div
                  key={`${item.itemType}-${item.id}`}
                  className="grid gap-3 rounded-md border p-4 md:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{item.studentName}</p>
                      <p className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
                        {item.itemType === "criterion" ? "Criterion" : "Deliverable"}
                      </p>
                      <p
                        className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${getStatusTone(item.status)}`}
                      >
                        {formatQueueStatus(item.status)}
                      </p>
                      <p
                        className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${getAIReviewStateTone(item.aiReviewState)}`}
                      >
                        {formatAIReviewState(item.aiReviewState)}
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.className} · {item.examSession} · {item.reviewTitle}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.studentEmail} · {item.reviewContext} · {item.reviewDetail} ·{" "}
                      {item.versionNumber ? `v${item.versionNumber} · ` : ""}
                      {item.submittedAt
                        ? item.submittedAt.toLocaleString()
                        : "No submission timestamp"}
                    </p>
                  </div>
                  <Button asChild size="sm">
                    <Link
                      href={item.href}
                    >
                      Open review
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No submissions match this queue filter.
            </p>
          )}
        </CardContent>
      </Card>

      <ActivityCard
        title="Recent activity"
        description="Latest submissions, review updates, and milestone alerts."
        items={activityItems}
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Create class</CardTitle>
            <CardDescription>
              New classes receive an invite code and default IA milestones.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {subjects.length > 0 ? (
              <CreateClassForm subjects={subjects} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No subjects found. Run `npx prisma db seed` before creating a class.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Choose class</CardTitle>
            <CardDescription>Open a class to view students and submission status.</CardDescription>
          </CardHeader>
          <CardContent>
            {classes.length > 0 ? (
              <div className="grid gap-3">
                {classes.map((classRecord) => (
                  <div
                    key={classRecord.id}
                    className="rounded-md border p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h2 className="font-medium">{classRecord.name}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {classRecord.subject.name} · {classRecord.examSession}
                        </p>
                      </div>
                      <div className="flex gap-4 text-sm text-muted-foreground">
                        <span>{classRecord.enrollments.length} students</span>
                        <span>{classRecord.milestones.length} milestones</span>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button asChild size="sm">
                        <Link href={`/teacher/classes/${classRecord.id}`}>
                          Open class
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/teacher/classes/${classRecord.id}/analytics`}>
                          Analytics
                        </Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No classes yet. Create your first IA supervision class.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function ActivityCard({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: ActivityItem[];
}) {
  return (
    <details className="rounded-md border bg-card">
      <summary className="cursor-pointer px-6 py-4">
        <span className="font-medium">
          {title} ({items.length})
        </span>
        <span className="ml-3 text-sm text-muted-foreground">{description}</span>
      </summary>
      <div className="border-t px-6 py-4">
        {items.length > 0 ? (
          <div className="grid gap-2">
            {items.map((item) => {
              const content = (
                <div className="flex flex-col gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/60 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-muted-foreground">{item.description}</p>
                  </div>
                  <p className={`shrink-0 rounded-md border px-2 py-1 text-xs ${getActivityTone(item.tone)}`}>
                    {item.timestamp.toLocaleString()}
                  </p>
                </div>
              );

              return item.href ? (
                <Link key={item.id} href={item.href}>
                  {content}
                </Link>
              ) : (
                <div key={item.id}>{content}</div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No recent activity yet.</p>
        )}
      </div>
    </details>
  );
}

function getActivityTone(tone: ActivityItem["tone"]) {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "default":
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function MetricPill({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-baseline gap-2 rounded-md bg-muted/50 px-3 py-2">
      <span className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </span>
      <span className="text-lg font-semibold">{value}</span>
    </div>
  );
}

function TeacherAccessMessage({
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

function getAIReviewStateTone(state: string) {
  switch (state) {
    case "current":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "pending":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "stale":
    case "failed":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "not_applicable":
      return "border-stone-200 bg-stone-50 text-stone-700";
    case "missing":
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

function formatAIReviewState(state: string) {
  switch (state) {
    case "current":
      return "AI current";
    case "stale":
      return "AI needs rerun";
    case "failed":
      return "AI failed";
    case "pending":
      return "AI pending";
    case "not_applicable":
      return "Manual review";
    case "missing":
    default:
      return "No AI review";
  }
}

function formatQueueStatus(status: SubmissionStatus) {
  switch (status) {
    case "submitted":
      return "Awaiting review";
    case "under_review":
      return "Under review";
    case "revision_needed":
      return "Needs revision";
    default:
      return status
        .split("_")
        .map((part) => part[0]?.toUpperCase() + part.slice(1))
        .join(" ");
  }
}
