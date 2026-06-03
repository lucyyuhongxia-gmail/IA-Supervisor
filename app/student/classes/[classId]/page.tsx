import Link from "next/link";
import { notFound } from "next/navigation";
import type { SubmissionStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/current-user";
import { formatFileSize } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import {
  ensureEnrollmentSubmissionSlots,
  formatSubmissionStatus,
} from "@/lib/submissions";

import { FinalSubmissionForm } from "./final-submission-form";

export const dynamic = "force-dynamic";

export default async function StudentClassPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const user = await getCurrentUser();
  const { classId } = await params;

  if (!user) {
    return <AccessMessage title="Sign in required" description="Use a student account to manage IA submissions." />;
  }

  if (user.role !== "student") {
    return <AccessMessage title="Student account required" description="This workspace is reserved for students." />;
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: { classId, studentId: user.id },
    select: { id: true },
  });

  if (!enrollment) {
    notFound();
  }

  await ensureEnrollmentSubmissionSlots({ enrollmentId: enrollment.id, classId });

  const classRecord = await prisma.class.findFirst({
    where: { id: classId },
    include: {
      subject: {
        include: {
          criteria: {
            orderBy: { sortOrder: "asc" },
            include: {
              submissionSlots: {
                where: { enrollmentId: enrollment.id },
                include: {
                  latestVersion: {
                    include: {
                      fileAssets: { orderBy: { createdAt: "desc" } },
                      feedbackSnapshots: {
                        where: { status: "sent" },
                        orderBy: { sentAt: "desc" },
                        take: 1,
                      },
                    },
                  },
                  fileAssets: { orderBy: { createdAt: "desc" } },
                },
              },
            },
          },
        },
      },
      teacher: { select: { name: true, email: true } },
    },
  });

  if (!classRecord) {
    notFound();
  }

  const criteriaWithSlots = classRecord.subject.criteria.map((criterion) => ({
    criterion,
    slot: criterion.submissionSlots[0],
  }));
  const completionItems = criteriaWithSlots.map(({ criterion, slot }) => {
    const latestVersion = slot?.latestVersion;
    const latestFiles =
      latestVersion?.fileAssets.length
        ? latestVersion.fileAssets
        : slot?.fileAssets ?? [];
    const status = slot?.status ?? "not_started";

    return {
      criterion,
      slot,
      status,
      hasSubmittedVersion: Boolean(latestVersion),
      hasFile: latestFiles.length > 0,
      isPassed: status === "passed" || status === "final_submitted",
      isFinalSubmitted: status === "final_submitted",
      needsRevision: status === "revision_needed",
      isWaitingReview: status === "submitted" || status === "under_review",
      blockers: getStudentCompletionBlockers({
        criterionCode: criterion.code,
        status,
        hasSubmittedVersion: Boolean(latestVersion),
        hasFile: latestFiles.length > 0,
      }),
    };
  });
  const passedOrFinalCount = criteriaWithSlots.filter(({ slot }) =>
    slot?.status === "passed" || slot?.status === "final_submitted",
  ).length;
  const submittedOrReviewCount = completionItems.filter(
    (item) => item.isWaitingReview,
  ).length;
  const revisionNeededCount = completionItems.filter(
    (item) => item.needsRevision,
  ).length;
  const isFinalSubmitted =
    criteriaWithSlots.length > 0 &&
    criteriaWithSlots.every(({ slot }) => slot?.status === "final_submitted");
  const canFinalize =
    criteriaWithSlots.length > 0 &&
    criteriaWithSlots.every(
      ({ slot }) =>
        Boolean(slot?.latestVersionId) &&
        (slot?.status === "passed" || slot?.status === "final_submitted"),
    );
  const finalSubmissionBlockers = completionItems.flatMap((item) => item.blockers);
  const finalSubmittedAt = isFinalSubmitted
    ? completionItems
        .map((item) => item.slot?.updatedAt)
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => b.getTime() - a.getTime())[0]
    : null;
  const completionStateLabel = isFinalSubmitted
    ? "Final submitted"
    : canFinalize
      ? "Ready to final submit"
      : "In progress";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <section>
        <Button asChild variant="ghost" size="sm" className="-ml-3 mb-3">
          <Link href="/student/dashboard">Back to dashboard</Link>
        </Button>
        <p className="text-sm font-medium text-muted-foreground">Student submissions</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">{classRecord.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {classRecord.subject.name} · {classRecord.examSession} · {classRecord.teacher.name}
        </p>
      </section>

      <Card
        className={
          isFinalSubmitted
            ? "border-emerald-200 bg-emerald-50/70"
            : canFinalize
              ? "border-blue-200 bg-blue-50/60"
              : "border-amber-200 bg-amber-50/50"
        }
      >
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-lg">Completion status</CardTitle>
              <CardDescription>
                Your final submission becomes available after every criterion is passed.
              </CardDescription>
            </div>
            <p
              className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${
                isFinalSubmitted
                  ? "border-emerald-200 bg-emerald-100 text-emerald-900"
                  : canFinalize
                    ? "border-blue-200 bg-blue-100 text-blue-900"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              {completionStateLabel}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <p className="text-sm text-muted-foreground">
                  {isFinalSubmitted
                    ? "Your IA submission is final submitted and all criterion uploads are locked."
                    : canFinalize
                      ? "All criteria are passed. Finalize only when you are ready to lock the full IA submission."
                      : "Resolve the items below before final submission is available."}
                </p>
                {finalSubmittedAt ? (
                  <p className="mt-2 text-xs font-medium text-emerald-900">
                    Locked {finalSubmittedAt.toLocaleString()}
                  </p>
                ) : null}
              </div>
              <FinalSubmissionForm
                classId={classRecord.id}
                canFinalize={canFinalize}
                isFinalSubmitted={isFinalSubmitted}
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <CompletionMetric
                label="Passed"
                value={`${passedOrFinalCount}/${completionItems.length}`}
              />
              <CompletionMetric
                label="Waiting review"
                value={submittedOrReviewCount.toString()}
              />
              <CompletionMetric
                label="Needs revision"
                value={revisionNeededCount.toString()}
              />
              <CompletionMetric
                label="Final submitted"
                value={`${completionItems.filter((item) => item.isFinalSubmitted).length}/${completionItems.length}`}
              />
            </div>

            {finalSubmissionBlockers.length > 0 ? (
              <div className="rounded-md border bg-white/70 p-3">
                <p className="text-sm font-medium">Before final submission</p>
                <div className="mt-2 grid gap-1">
                  {finalSubmissionBlockers.map((blocker) => (
                    <p key={blocker} className="text-sm text-muted-foreground">
                      {blocker}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-2">
              {completionItems.map((item) => (
                <Link
                  key={item.criterion.id}
                  href={`/student/classes/${classRecord.id}/criteria/${item.criterion.id}`}
                  className="grid gap-3 rounded-md border bg-white/70 p-3 text-sm transition-colors hover:bg-white sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div>
                    <p className="font-medium">
                      Criterion {item.criterion.code}: {item.criterion.title}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <CompletionPill
                        label={formatSubmissionStatus(item.status as SubmissionStatus)}
                        tone={getCompletionPillTone(item.status)}
                      />
                      <CompletionPill
                        label={item.hasFile ? "File uploaded" : "Missing file"}
                        tone={item.hasFile ? "success" : "warning"}
                      />
                      <CompletionPill
                        label={item.isPassed ? "Passed" : "Not passed yet"}
                        tone={item.isPassed ? "success" : "muted"}
                      />
                    </div>
                  </div>
                  <span className="text-xs font-medium text-primary">
                    Open Criterion {item.criterion.code}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Criterion submissions</CardTitle>
          <CardDescription>
            Open one criterion at a time to upload files, add a note, and view version history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {classRecord.subject.criteria.map((criterion) => {
              const slot = criterion.submissionSlots[0];
              const latestVersion = slot?.latestVersion;
              const latestFiles =
                latestVersion?.fileAssets.length
                  ? latestVersion.fileAssets
                  : slot?.fileAssets ?? [];
              const status = slot?.status ?? "not_started";
              const teacherFeedback =
                latestVersion?.feedbackSnapshots[0]?.content ??
                latestVersion?.teacherFeedback ??
                slot?.teacherFeedback;
              const reviewedAt = latestVersion?.reviewedAt ?? slot?.reviewedAt;

              return (
                <div
                  key={criterion.id}
                  className="flex flex-col gap-4 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <h2 className="font-medium">
                      Criterion {criterion.code}: {criterion.title}
                    </h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <p
                        className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${getCriterionStatusTone(status)}`}
                      >
                        {formatSubmissionStatus(status)}
                      </p>
                      {latestVersion ? (
                        <p className="rounded-md border px-2 py-1 text-xs text-muted-foreground">
                          latest v{latestVersion.versionNumber}
                        </p>
                      ) : null}
                    </div>
                    {latestFiles.length > 0 ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {latestFiles[0]?.originalName} ·{" "}
                        {latestFiles[0] ? formatFileSize(latestFiles[0].sizeBytes) : ""}
                      </p>
                    ) : null}
                    {teacherFeedback ? (
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                        Feedback: {teacherFeedback}
                      </p>
                    ) : null}
                    {reviewedAt ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Reviewed {reviewedAt.toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                  <Button asChild variant={status === "revision_needed" ? "default" : "outline"}>
                    <Link href={`/student/classes/${classRecord.id}/criteria/${criterion.id}`}>
                      {getCriterionActionLabel(status, criterion.code)}
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function CompletionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white/70 px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function CompletionPill({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "info" | "warning" | "muted";
}) {
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${getCompletionPillClasses(tone)}`}
    >
      {label}
    </span>
  );
}

function getCompletionPillTone(status: string): "success" | "info" | "warning" | "muted" {
  switch (status) {
    case "passed":
    case "final_submitted":
      return "success";
    case "submitted":
    case "under_review":
      return "info";
    case "revision_needed":
      return "warning";
    default:
      return "muted";
  }
}

function getCompletionPillClasses(tone: "success" | "info" | "warning" | "muted") {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "info":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "muted":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getStudentCompletionBlockers({
  criterionCode,
  status,
  hasSubmittedVersion,
  hasFile,
}: {
  criterionCode: string;
  status: string;
  hasSubmittedVersion: boolean;
  hasFile: boolean;
}) {
  const blockers: string[] = [];

  if (!hasSubmittedVersion) {
    blockers.push(`Criterion ${criterionCode}: submit a document.`);
  }

  if (!hasFile) {
    blockers.push(`Criterion ${criterionCode}: upload a PDF file.`);
  }

  if (status === "revision_needed") {
    blockers.push(`Criterion ${criterionCode}: revise and resubmit based on teacher feedback.`);
  } else if (status === "submitted" || status === "under_review") {
    blockers.push(`Criterion ${criterionCode}: wait for teacher review.`);
  } else if (status !== "passed" && status !== "final_submitted") {
    blockers.push(`Criterion ${criterionCode}: needs teacher pass.`);
  }

  return blockers;
}

function getCriterionStatusTone(status: string) {
  switch (status) {
    case "passed":
    case "final_submitted":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "revision_needed":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "submitted":
    case "under_review":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "not_started":
    case "draft":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

function getCriterionActionLabel(status: string, criterionCode: string) {
  switch (status) {
    case "revision_needed":
      return `Revise Criterion ${criterionCode}`;
    case "passed":
    case "final_submitted":
      return `View Criterion ${criterionCode}`;
    case "submitted":
    case "under_review":
      return `Check Criterion ${criterionCode}`;
    default:
      return `Open Criterion ${criterionCode}`;
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
