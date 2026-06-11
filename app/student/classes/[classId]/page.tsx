import Link from "next/link";
import { notFound } from "next/navigation";
import type { SubmissionStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/current-user";
import {
  buildFinalReadiness,
  getDeliverableEvidenceState,
  isFinalSubmitted as isFinalSubmittedStatus,
  isPassedOrFinal,
} from "@/lib/final-readiness";
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
      deliverables: {
        where: { isArchived: false },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          criteria: {
            orderBy: { sortOrder: "asc" },
            include: {
              criterion: true,
            },
          },
          submissionSlots: {
            where: { enrollmentId: enrollment.id },
            include: {
              latestVersion: {
                include: {
                  fileAssets: { orderBy: { createdAt: "desc" } },
                },
              },
              fileAssets: { orderBy: { createdAt: "desc" } },
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
  const deliverablesWithSlots = classRecord.deliverables.map((deliverable) => {
    const slot = deliverable.submissionSlots[0];
    const latestVersion = slot?.latestVersion;
    const evidence = getDeliverableEvidenceState({
      latestVersion,
      slot,
    });
    const latestFiles =
      latestVersion?.fileAssets.length
        ? latestVersion.fileAssets
        : slot?.fileAssets ?? [];
    const latestArtifactUrl = latestVersion?.artifactUrl ?? slot?.artifactUrl;

    return {
      deliverable,
      slot,
      status: slot?.status ?? "not_started",
      evidence,
      latestVersion,
      latestFiles,
      latestArtifactUrl,
    };
  });
  const finalReadiness = buildFinalReadiness({
    criteria: criteriaWithSlots.map(({ criterion, slot }) => ({
      id: criterion.id,
      code: criterion.code,
      title: criterion.title,
      status: slot?.status ?? "not_started",
    })),
    deliverables: deliverablesWithSlots.map(({ deliverable, slot, evidence }) => ({
      id: deliverable.id,
      title: deliverable.title,
      reviewMode: deliverable.reviewMode,
      status: slot?.status ?? "not_started",
      hasEvidence: evidence.hasEvidence,
    })),
  });
  const completionItems = criteriaWithSlots.map(({ criterion, slot }) => {
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

    return {
      criterion,
      slot,
      status,
      latestVersion,
      latestFiles,
      teacherFeedback,
      reviewedAt,
      hasSubmittedVersion: Boolean(latestVersion),
      hasFile: latestFiles.length > 0,
      isPassed: isPassedOrFinal(status),
      isFinalSubmitted: isFinalSubmittedStatus(status),
      needsRevision: status === "revision_needed",
      isWaitingReview: status === "submitted" || status === "under_review",
      blockers: getStudentCompletionBlockers({
        criterionCode: criterion.code,
        status,
      }),
    };
  });
  const passedOrFinalCount = finalReadiness.criteriaPassedCount;
  const deliverablesPassedCount = finalReadiness.deliverablesPassedCount;
  const submittedOrReviewCount = completionItems.filter(
    (item) => item.isWaitingReview,
  ).length;
  const revisionNeededCount = completionItems.filter(
    (item) => item.needsRevision,
  ).length;
  const isFinalSubmitted =
    criteriaWithSlots.length > 0 &&
    criteriaWithSlots.every(({ slot }) => slot?.status === "final_submitted") &&
    deliverablesWithSlots.every(({ slot }) => slot?.status === "final_submitted");
  const canFinalize = finalReadiness.isReady && !isFinalSubmitted;
  const finalSubmissionBlockers = finalReadiness.issues.map(
    (issue) => `${issue.label}: ${issue.detail}`,
  );
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
              <CardTitle className="text-lg">Class progress</CardTitle>
              <CardDescription>
                Open the item that needs work. Final submission unlocks after all required items are passed.
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
            <div className="grid gap-2 sm:grid-cols-5">
              <CompletionMetric
                label="Passed"
                value={`${passedOrFinalCount}/${completionItems.length}`}
              />
              <CompletionMetric
                label="Deliverables"
                value={`${deliverablesPassedCount}/${deliverablesWithSlots.length}`}
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

            <div className="grid gap-3">
              <div>
                <p className="mb-2 text-sm font-medium">Criteria documents</p>
                <div className="grid gap-2">
                  {completionItems.map((item) => (
                    <Link
                      key={item.criterion.id}
                      href={`/student/classes/${classRecord.id}/criteria/${item.criterion.id}`}
                      className="grid gap-3 rounded-md border bg-white/80 p-3 text-sm transition-colors hover:bg-white sm:grid-cols-[1fr_auto] sm:items-center"
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
                            tone={item.hasFile ? "success" : "muted"}
                          />
                          {item.latestVersion ? (
                            <CompletionPill
                              label={`Latest v${item.latestVersion.versionNumber}`}
                              tone="muted"
                            />
                          ) : null}
                        </div>
                        {item.latestFiles.length > 0 ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {item.latestFiles[0]?.originalName} ·{" "}
                            {item.latestFiles[0]
                              ? formatFileSize(item.latestFiles[0].sizeBytes)
                              : ""}
                          </p>
                        ) : null}
                        {item.teacherFeedback ? (
                          <p className="mt-2 line-clamp-2 text-xs text-amber-900">
                            Latest teacher feedback: {item.teacherFeedback}
                          </p>
                        ) : null}
                        {item.reviewedAt ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Reviewed {item.reviewedAt.toLocaleString()}
                          </p>
                        ) : null}
                      </div>
                      <span className="w-fit rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
                        {getCriterionActionLabel(item.status, item.criterion.code)}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>

              {deliverablesWithSlots.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm font-medium">Other required deliverables</p>
                  <div className="grid gap-2">
                    {deliverablesWithSlots.map(
                      ({ deliverable, slot, status, latestVersion, latestFiles }) => (
                        <Link
                          key={deliverable.id}
                          href={`/student/classes/${classRecord.id}/deliverables/${deliverable.id}`}
                          className="grid gap-3 rounded-md border bg-white/80 p-3 text-sm transition-colors hover:bg-white sm:grid-cols-[1fr_auto] sm:items-center"
                        >
                          <div>
                            <p className="font-medium">{deliverable.title}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <CompletionPill
                                label={formatSubmissionStatus(
                                  (slot?.status ?? "not_started") as SubmissionStatus,
                                )}
                                tone={getCompletionPillTone(status)}
                              />
                              <CompletionPill
                                label={latestFiles.length > 0 ? "File uploaded" : "Missing file"}
                                tone={latestFiles.length > 0 ? "success" : "muted"}
                              />
                              {latestVersion ? (
                                <CompletionPill
                                  label={`Latest v${latestVersion.versionNumber}`}
                                  tone="muted"
                                />
                              ) : null}
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {formatReviewMode(deliverable.reviewMode)}
                              {deliverable.criteria.length > 0
                                ? ` · Related to ${deliverable.criteria
                                    .map((link) => `Criterion ${link.criterion.code}`)
                                    .join(", ")}`
                                : ""}
                            </p>
                            {latestFiles.length > 0 ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {latestFiles[0]?.originalName} ·{" "}
                                {latestFiles[0]
                                  ? formatFileSize(latestFiles[0].sizeBytes)
                                  : ""}
                              </p>
                            ) : null}
                          </div>
                          <span className="w-fit rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
                            {getDeliverableActionLabel(status, deliverable.title)}
                          </span>
                        </Link>
                      ),
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-md border bg-white/80 p-3">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="text-sm font-medium">Final IA submission</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isFinalSubmitted
                      ? "Your IA submission is final submitted and all uploads are locked."
                      : canFinalize
                        ? "All required items are passed. Finalize only when you are ready to lock the full IA submission."
                        : "Final submission unlocks after every required item is passed."}
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

              {finalSubmissionBlockers.length > 0 ? (
                <details className="mt-3 rounded-md border bg-muted/20 px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">
                    Why final submission is not ready
                  </summary>
                  <div className="mt-2 grid gap-1">
                    {finalSubmissionBlockers.map((blocker) => (
                      <p key={blocker} className="text-sm text-muted-foreground">
                        {blocker}
                      </p>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <details className="rounded-md border bg-card">
        <summary className="flex cursor-pointer list-none flex-col gap-1 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-medium">Submission plan reference</span>
          <span className="text-sm text-muted-foreground">
            Expected deliverables and assessment links
          </span>
        </summary>
        <div className="border-t px-6 pb-6 pt-4">
          {classRecord.deliverables.length > 0 ? (
            <div className="grid gap-3">
              {deliverablesWithSlots.map(
                ({
                  deliverable,
                  slot: deliverableSlot,
                  latestVersion,
                  latestFiles,
                  latestArtifactUrl,
                }) => {
                  return (
                    <div key={deliverable.id} className="rounded-md border p-3 text-sm">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-medium">{deliverable.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatReviewMode(deliverable.reviewMode)}
                            {deliverable.fileRequirement
                              ? ` · ${deliverable.fileRequirement}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <span
                            className={`w-fit rounded-md border px-2 py-1 text-xs font-semibold ${getCriterionStatusTone(deliverableSlot?.status ?? "not_started")}`}
                          >
                            {deliverableSlot
                              ? formatSubmissionStatus(deliverableSlot.status)
                              : "Not Started"}
                          </span>
                          <span className="w-fit rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                            #{deliverable.sortOrder}
                          </span>
                        </div>
                      </div>
                      {latestVersion ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Latest v{latestVersion.versionNumber} ·{" "}
                          {latestVersion.submittedAt.toLocaleString()}
                        </p>
                      ) : null}
                      {latestFiles.length > 0 ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {latestFiles[0]?.originalName} ·{" "}
                          {latestFiles[0] ? formatFileSize(latestFiles[0].sizeBytes) : ""}
                        </p>
                      ) : null}
                      {latestArtifactUrl ? (
                        <a
                          href={latestArtifactUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 block break-all text-xs text-primary underline-offset-4 hover:underline"
                        >
                          {latestArtifactUrl}
                        </a>
                      ) : null}
                      {deliverable.criteria.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {deliverable.criteria.map((link) => (
                            <span
                              key={link.id}
                              className="rounded-md border bg-background px-2 py-1 text-xs font-medium"
                            >
                              Criterion {link.criterion.code}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {deliverable.description ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {deliverable.description}
                        </p>
                      ) : null}
                    </div>
                  );
                },
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This class does not have a submission plan yet.
            </p>
          )}
        </div>
      </details>
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
}: {
  criterionCode: string;
  status: string;
}) {
  const blockers: string[] = [];

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

function getDeliverableActionLabel(status: string, title: string) {
  switch (status) {
    case "revision_needed":
      return `Revise ${title}`;
    case "passed":
    case "final_submitted":
      return `View ${title}`;
    case "submitted":
    case "under_review":
      return `Check ${title}`;
    default:
      return `Submit ${title}`;
  }
}

function formatReviewMode(value: string) {
  switch (value) {
    case "multi_criteria":
      return "Multi-criteria review";
    case "final_package":
      return "Final package";
    case "single_criterion":
    default:
      return "Single criterion review";
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
