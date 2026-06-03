import Link from "next/link";
import { notFound } from "next/navigation";
import type { SubmissionStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import {
  ensureClassSubmissionSlots,
  formatSubmissionStatus,
} from "@/lib/submissions";

import { AnalyticsCharts } from "./analytics-charts";

export const dynamic = "force-dynamic";

type StatusBucket = "passed" | "submitted" | "revision_needed" | "not_started";

export default async function TeacherClassAnalyticsPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const user = await getCurrentUser();
  const { classId } = await params;

  if (!user) {
    return <AccessMessage title="Sign in required" description="Use a teacher account to view class analytics." />;
  }

  if (user.role !== "teacher") {
    return <AccessMessage title="Teacher account required" description="Analytics are reserved for teachers." />;
  }

  const classAccess = await prisma.class.findFirst({
    where: { id: classId, teacherId: user.id },
    select: { id: true },
  });

  if (!classAccess) {
    notFound();
  }

  await ensureClassSubmissionSlots(classId);

  const classRecord = await prisma.class.findFirst({
    where: { id: classId, teacherId: user.id },
    include: {
      subject: {
        include: {
          criteria: { orderBy: { sortOrder: "asc" } },
        },
      },
      enrollments: {
        orderBy: { enrolledAt: "asc" },
        include: {
          student: { select: { name: true, email: true } },
          submissionSlots: {
            include: {
              criterion: true,
              latestVersion: true,
              markingSnapshots: {
                where: {
                  teacherFinalMark: { not: null },
                },
                orderBy: { finalMarkedAt: "desc" },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!classRecord) {
    notFound();
  }

  const sortedCriteria = classRecord.subject.criteria;
  const allSlots = classRecord.enrollments.flatMap(
    (enrollment) => enrollment.submissionSlots,
  );
  const statusSummary = getStatusSummary(allSlots.map((slot) => slot.status));
  const totalSlots = Math.max(1, allSlots.length);
  const passedCount = statusSummary.find((item) => item.status === "passed")?.count ?? 0;
  const submittedCount = statusSummary.find((item) => item.status === "submitted")?.count ?? 0;
  const revisionNeededCount =
    statusSummary.find((item) => item.status === "revision_needed")?.count ?? 0;
  const notStartedCount =
    statusSummary.find((item) => item.status === "not_started")?.count ?? 0;
  const completionPercent = Math.round((passedCount / totalSlots) * 100);
  const criterionStatus = sortedCriteria.map((criterion) => {
    const slots = allSlots.filter((slot) => slot.criterionId === criterion.id);
    const summary = getStatusSummary(slots.map((slot) => slot.status));

    return {
      criterion: `Criterion ${criterion.code}`,
      passed: summary.find((item) => item.status === "passed")?.count ?? 0,
      submitted: summary.find((item) => item.status === "submitted")?.count ?? 0,
      revisionNeeded:
        summary.find((item) => item.status === "revision_needed")?.count ?? 0,
      notStarted:
        summary.find((item) => item.status === "not_started")?.count ?? 0,
    };
  });
  const studentRows = classRecord.enrollments.map((enrollment) => {
    const slotsByCriterionId = new Map(
      enrollment.submissionSlots.map((slot) => [slot.criterionId, slot]),
    );
    const slots = sortedCriteria.map((criterion) =>
      slotsByCriterionId.get(criterion.id),
    );
    const latestSubmission = slots
      .map((slot) => slot?.latestVersion?.submittedAt ?? slot?.submittedAt)
      .filter((submittedAt): submittedAt is Date => Boolean(submittedAt))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    const rowSummary = getStatusSummary(
      slots.map((slot) => slot?.status ?? "not_started"),
    );

    return {
      id: enrollment.id,
      name: enrollment.student.name,
      email: enrollment.student.email,
      latestSubmission,
      passed:
        rowSummary.find((item) => item.status === "passed")?.count ?? 0,
      revisionNeeded:
        rowSummary.find((item) => item.status === "revision_needed")?.count ?? 0,
      slots: sortedCriteria.map((criterion) => ({
        criterion,
        slot: slotsByCriterionId.get(criterion.id),
      })),
    };
  });
  const maxTotalMarks = sortedCriteria.reduce(
    (total, criterion) => total + criterion.maxMarks,
    0,
  );
  const markRows = classRecord.enrollments.map((enrollment) => {
    const slotsByCriterionId = new Map(
      enrollment.submissionSlots.map((slot) => [slot.criterionId, slot]),
    );
    const marks = sortedCriteria.map((criterion) => {
      const slot = slotsByCriterionId.get(criterion.id);
      const snapshot = slot?.markingSnapshots[0] ?? null;

      return {
        criterion,
        slot,
        mark: snapshot?.teacherFinalMark ?? null,
        finalMarkedAt: snapshot?.finalMarkedAt ?? null,
      };
    });
    const total = marks.reduce((sum, item) => sum + (item.mark ?? 0), 0);
    const missingCount = marks.filter((item) => item.mark === null).length;
    const isFinalSubmitted =
      marks.length > 0 &&
      marks.every((item) => item.slot?.status === "final_submitted");

    return {
      id: enrollment.id,
      name: enrollment.student.name,
      email: enrollment.student.email,
      marks,
      total,
      missingCount,
      isComplete: missingCount === 0,
      isFinalSubmitted,
    };
  });
  const completeMarkRows = markRows.filter((row) => row.isComplete);
  const missingFinalMarks = markRows.reduce(
    (sum, row) => sum + row.missingCount,
    0,
  );
  const averageTotal =
    completeMarkRows.length > 0
      ? Math.round(
          (completeMarkRows.reduce((sum, row) => sum + row.total, 0) /
            completeMarkRows.length) *
            10,
        ) / 10
      : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-3">
            <Link href={`/teacher/classes/${classRecord.id}`}>Back to class</Link>
          </Button>
          <p className="text-sm font-medium text-muted-foreground">
            Teacher analytics
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">
            {classRecord.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {classRecord.subject.name} · {classRecord.examSession}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/teacher/dashboard">Teacher dashboard</Link>
        </Button>
      </section>

      <div className="grid gap-4 md:grid-cols-5">
        <MetricCard label="Students" value={classRecord.enrollments.length} />
        <MetricCard label="Completion" value={`${completionPercent}%`} />
        <MetricCard label="Passed" value={passedCount} />
        <MetricCard label="Awaiting review" value={submittedCount} />
        <MetricCard label="Needs revision" value={revisionNeededCount} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Fully marked" value={completeMarkRows.length} />
        <MetricCard
          label="Average total"
          value={averageTotal === null ? "N/A" : `${averageTotal}/${maxTotalMarks}`}
        />
        <MetricCard label="Missing marks" value={missingFinalMarks} />
        <MetricCard
          label="Final submitted"
          value={markRows.filter((row) => row.isFinalSubmitted).length}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Class charts</CardTitle>
          <CardDescription>
            Visual status analytics generated from submission and teacher review states.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnalyticsCharts
            statusSummary={statusSummary.map((item) => ({
              label: item.label,
              value: item.count,
            }))}
            criterionStatus={criterionStatus}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Criterion breakdown</CardTitle>
          <CardDescription>
            Compare status distribution by criterion across the whole class.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {criterionStatus.map((criterion) => (
              <div key={criterion.criterion} className="rounded-md border p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="font-medium">{criterion.criterion}</p>
                  <p className="text-sm text-muted-foreground">
                    {criterion.passed} passed · {criterion.submitted} awaiting ·{" "}
                    {criterion.revisionNeeded} revision · {criterion.notStarted} not started
                  </p>
                </div>
                <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-muted">
                  {buildBarSegments(criterion, classRecord.enrollments.length).map((segment) => (
                    <div
                      key={segment.key}
                      className={segment.className}
                      style={{ width: `${segment.widthPercent}%` }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Marks overview</CardTitle>
          <CardDescription>
            Teacher-saved final marks from the latest marking snapshot for each criterion.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {markRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-3 py-2 font-medium">Student</th>
                    {sortedCriteria.map((criterion) => (
                      <th key={criterion.id} className="px-3 py-2 font-medium">
                        {criterion.code} /{criterion.maxMarks}
                      </th>
                    ))}
                    <th className="px-3 py-2 font-medium">Total</th>
                    <th className="px-3 py-2 font-medium">Missing</th>
                    <th className="px-3 py-2 font-medium">Final submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {markRows.map((student) => (
                    <tr key={student.id} className="border-b align-top">
                      <td className="px-3 py-3">
                        <Link
                          href={`/teacher/classes/${classRecord.id}/students/${student.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {student.name}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {student.email}
                        </p>
                      </td>
                      {student.marks.map(({ criterion, slot, mark }) => (
                        <td key={criterion.id} className="px-3 py-3">
                          {slot ? (
                            <Link
                              href={`/teacher/classes/${classRecord.id}/students/${student.id}/criteria/${criterion.id}`}
                              className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold underline-offset-4 hover:underline ${
                                mark === null
                                  ? "border-amber-200 bg-amber-50 text-amber-800"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-800"
                              }`}
                            >
                              {mark === null ? "Missing" : `${mark}/${criterion.maxMarks}`}
                            </Link>
                          ) : (
                            <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
                              Missing
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-3 font-medium">
                        {student.isComplete ? `${student.total}/${maxTotalMarks}` : `${student.total}+/${maxTotalMarks}`}
                      </td>
                      <td className="px-3 py-3">
                        {student.missingCount === 0 ? (
                          <span className="text-emerald-700">Complete</span>
                        ) : (
                          <span className="text-amber-700">
                            {student.missingCount} missing
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {student.isFinalSubmitted ? "Yes" : "No"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No students have joined this class yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Student progress matrix</CardTitle>
          <CardDescription>
            Open a student criterion directly from the matrix when intervention is needed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {studentRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-3 py-2 font-medium">Student</th>
                    {sortedCriteria.map((criterion) => (
                      <th key={criterion.id} className="px-3 py-2 font-medium">
                        {criterion.code}
                      </th>
                    ))}
                    <th className="px-3 py-2 font-medium">Passed</th>
                    <th className="px-3 py-2 font-medium">Needs revision</th>
                    <th className="px-3 py-2 font-medium">Latest submission</th>
                  </tr>
                </thead>
                <tbody>
                  {studentRows.map((student) => (
                    <tr key={student.id} className="border-b align-top">
                      <td className="px-3 py-3">
                        <p className="font-medium">{student.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {student.email}
                        </p>
                      </td>
                      {student.slots.map(({ criterion, slot }) => (
                        <td key={criterion.id} className="px-3 py-3">
                          {slot ? (
                            <Link
                              href={`/teacher/classes/${classRecord.id}/students/${student.id}/criteria/${criterion.id}`}
                              className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold underline-offset-4 hover:underline ${getStatusTone(slot.status)}`}
                            >
                              {formatSubmissionStatus(slot.status)}
                            </Link>
                          ) : (
                            <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
                              Not Started
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-3">{student.passed}</td>
                      <td className="px-3 py-3">{student.revisionNeeded}</td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {student.latestSubmission
                          ? student.latestSubmission.toLocaleDateString()
                          : "None"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No students have joined this class yet.
            </p>
          )}
        </CardContent>
      </Card>

      {notStartedCount > 0 ? (
        <p className="text-sm text-muted-foreground">
          {notStartedCount} criterion slots have not started yet.
        </p>
      ) : null}
    </main>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function getStatusBucket(status: SubmissionStatus): StatusBucket {
  switch (status) {
    case "passed":
    case "final_submitted":
      return "passed";
    case "submitted":
    case "under_review":
      return "submitted";
    case "revision_needed":
      return "revision_needed";
    case "not_started":
    case "draft":
    case "locked":
    default:
      return "not_started";
  }
}

function getStatusSummary(statuses: SubmissionStatus[]) {
  const bucketedStatuses = statuses.map(getStatusBucket);

  return [
    {
      status: "passed" as const,
      label: "Passed",
      count: bucketedStatuses.filter((status) => status === "passed").length,
    },
    {
      status: "submitted" as const,
      label: "Submitted / in review",
      count: bucketedStatuses.filter((status) => status === "submitted").length,
    },
    {
      status: "revision_needed" as const,
      label: "Needs revision",
      count: bucketedStatuses.filter((status) => status === "revision_needed").length,
    },
    {
      status: "not_started" as const,
      label: "Not started",
      count: bucketedStatuses.filter((status) => status === "not_started").length,
    },
  ];
}

function buildBarSegments(
  criterion: {
    passed: number;
    submitted: number;
    revisionNeeded: number;
    notStarted: number;
  },
  studentCount: number,
) {
  const total = Math.max(1, studentCount);

  return [
    {
      key: "passed",
      className: "bg-emerald-500",
      widthPercent: (criterion.passed / total) * 100,
    },
    {
      key: "submitted",
      className: "bg-blue-500",
      widthPercent: (criterion.submitted / total) * 100,
    },
    {
      key: "revision-needed",
      className: "bg-amber-500",
      widthPercent: (criterion.revisionNeeded / total) * 100,
    },
    {
      key: "not-started",
      className: "bg-slate-300",
      widthPercent: (criterion.notStarted / total) * 100,
    },
  ].filter((segment) => segment.widthPercent > 0);
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

function AccessMessage({
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
