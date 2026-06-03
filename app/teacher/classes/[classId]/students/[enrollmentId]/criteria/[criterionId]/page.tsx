import Link from "next/link";
import { notFound } from "next/navigation";
import type { SubmissionStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/current-user";
import { extractFileText } from "@/lib/file-extraction";
import { formatFileSize } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { getTeacherReviewQueue } from "@/lib/review-queue";
import {
  ensureClassSubmissionSlots,
  formatSubmissionStatus,
} from "@/lib/submissions";

import { AIReviewHistory } from "./ai-review-history";
import { AIReviewForm } from "./ai-review-form";
import { DeltaReviewPanel } from "./delta-review-panel";
import { MarkingAssistantPanel } from "./marking-assistant-panel";
import { ReopenFinalSubmissionForm } from "./reopen-final-submission-form";
import { SemanticExtractionPanel } from "./semantic-extraction-panel";
import { TeacherFeedbackForm } from "../../teacher-feedback-form";

export const dynamic = "force-dynamic";

export default async function TeacherCriterionReviewPage({
  params,
}: {
  params: Promise<{ classId: string; enrollmentId: string; criterionId: string }>;
}) {
  const user = await getCurrentUser();
  const { classId, enrollmentId, criterionId } = await params;

  if (!user) {
    return <AccessMessage title="Sign in required" description="Use a teacher account to review this submission." />;
  }

  if (user.role !== "teacher") {
    return <AccessMessage title="Teacher account required" description="This review page is reserved for teachers." />;
  }

  const classAccess = await prisma.class.findFirst({
    where: { id: classId, teacherId: user.id },
    select: { id: true },
  });

  if (!classAccess) {
    notFound();
  }

  await ensureClassSubmissionSlots(classId);

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      id: enrollmentId,
      classId,
      class: { teacherId: user.id },
    },
    include: {
      student: { select: { name: true, email: true } },
      class: {
        include: {
          subject: true,
        },
      },
    },
  });

  if (!enrollment) {
    notFound();
  }

  const criterion = await prisma.criterionDef.findFirst({
    where: {
      id: criterionId,
      subjectId: enrollment.class.subjectId,
    },
  });

  if (!criterion) {
    notFound();
  }

  const slot = await prisma.submissionSlot.findFirst({
    where: {
      enrollmentId: enrollment.id,
      criterionId: criterion.id,
    },
    include: {
      latestVersion: {
        include: {
          fileAssets: { orderBy: { createdAt: "desc" } },
          feedbackSnapshots: {
            orderBy: { updatedAt: "desc" },
            include: {
              createdBy: { select: { name: true, email: true } },
            },
          },
        },
      },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          fileAssets: { orderBy: { createdAt: "desc" } },
        },
      },
      fileAssets: { orderBy: { createdAt: "desc" } },
      aiReviewRuns: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          findings: { orderBy: { sortOrder: "asc" } },
          requestedBy: { select: { name: true, email: true } },
        },
      },
      deltaReviews: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          requestedBy: { select: { name: true, email: true } },
          previousVersion: { select: { versionNumber: true } },
          currentVersion: { select: { versionNumber: true } },
        },
      },
    },
  });

  if (!slot) {
    notFound();
  }

  const latestVersion = slot.latestVersion;
  const files =
    latestVersion?.fileAssets.length ? latestVersion.fileAssets : slot.fileAssets;
  const feedbackDraft = latestVersion?.feedbackSnapshots.find(
    (snapshot) => snapshot.status === "draft",
  );
  const sentFeedback = latestVersion?.feedbackSnapshots.find(
    (snapshot) => snapshot.status === "sent",
  );
  const feedback =
    feedbackDraft?.content ??
    sentFeedback?.content ??
    latestVersion?.teacherFeedback ??
    slot.teacherFeedback ??
    "";
  const reviewedAt = latestVersion?.reviewedAt ?? slot.reviewedAt;
  const reviewQueue = await getTeacherReviewQueue(user.id);
  const currentQueueIndex = reviewQueue.findIndex((item) => item.id === slot.id);
  const nextReviewItem =
    currentQueueIndex >= 0 ? reviewQueue[currentQueueIndex + 1] : reviewQueue[0];
  const latestAIReviewRun = slot.aiReviewRuns[0];
  const latestDeltaReview = slot.deltaReviews[0] ?? null;
  const aiReviewState = getAIReviewWorkflowState(
    slot.latestVersionId,
    latestAIReviewRun?.submissionVersionId,
    latestAIReviewRun?.status,
  );
  const fileExtractionPreviews = await Promise.all(
    files.map(async (fileAsset) => ({
      fileId: fileAsset.id,
      extraction: await extractFileText(fileAsset),
    })),
  );
  const fileExtractionPreviewsById = new Map(
    fileExtractionPreviews.map((preview) => [preview.fileId, preview.extraction]),
  );
  const aiReviewDisabledReason = getAIReviewDisabledReason({
    status: slot.status,
    latestVersionId: slot.latestVersionId,
    files,
    fileExtractionPreviews,
  });
  const semanticExtraction = latestVersion
    ? await prisma.semanticExtraction.findUnique({
        where: {
          submissionVersionId_criterionId: {
            submissionVersionId: latestVersion.id,
            criterionId: criterion.id,
          },
        },
        include: {
          confirmedBy: { select: { name: true, email: true } },
        },
      })
    : null;
  const latestMarkingSnapshot = latestVersion
    ? await prisma.markingSnapshot.findFirst({
        where: {
          submissionVersionId: latestVersion.id,
          criterionId: criterion.id,
        },
        orderBy: { createdAt: "desc" },
        include: {
          requestedBy: { select: { name: true, email: true } },
        },
      })
    : null;
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      entityType: "submission_slot",
      entityId: slot.id,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      actor: { select: { name: true, email: true, role: true } },
    },
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-3">
            <Link href={`/teacher/classes/${classId}/students/${enrollment.id}`}>
              Back to student
            </Link>
          </Button>
          <p className="text-sm font-medium text-muted-foreground">
            {enrollment.class.name} · {enrollment.student.name}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">
            Criterion {criterion.code}: {criterion.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {enrollment.student.email} · {criterion.maxMarks} marks
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/teacher/dashboard">Back to review queue</Link>
        </Button>
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-lg">Review navigation</CardTitle>
              <CardDescription>
                Continue through the active review queue without returning to the dashboard.
              </CardDescription>
            </div>
            {nextReviewItem ? (
              <Button asChild>
                <Link href={nextReviewItem.href}>Next review item</Link>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                No next active item.
              </p>
            )}
          </div>
        </CardHeader>
        {nextReviewItem ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Next: {nextReviewItem.studentName} · {nextReviewItem.className} · Criterion{" "}
              {nextReviewItem.criterionCode}: {nextReviewItem.criterionTitle}
            </p>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-lg">Review status</CardTitle>
              <CardDescription>Current state for this criterion submission.</CardDescription>
            </div>
            <p
              className={`inline-flex rounded-md border px-3 py-2 text-sm font-semibold ${getStatusTone(slot.status)}`}
            >
              {formatSubmissionStatus(slot.status)}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {latestVersion ? (
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">Latest version: v{latestVersion.versionNumber}</p>
              <p className="mt-1 text-muted-foreground">
                Submitted {latestVersion.submittedAt.toLocaleString()}
              </p>
              {reviewedAt ? (
                <p className="mt-1 text-muted-foreground">
                  Reviewed {reviewedAt.toLocaleString()}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="rounded-md border p-3 text-sm text-muted-foreground">
              No submitted version yet.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <div className="grid content-start gap-4">
          {files.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Latest files</CardTitle>
                <CardDescription>
                  AI review uses server-side extracted text. Check the preview before relying on AI notes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {files.map((fileAsset) => {
                    const extraction = fileExtractionPreviewsById.get(fileAsset.id);
                    const isPdf = isPdfFile(fileAsset);

                    return (
                      <div key={fileAsset.id} className="rounded-md border p-3 text-sm">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <a
                              href={`/api/files/${fileAsset.id}`}
                              className="block truncate font-medium text-primary underline-offset-4 hover:underline"
                            >
                              {fileAsset.originalName}
                            </a>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {formatFileSize(fileAsset.sizeBytes)} · {fileAsset.mimeType}
                            </p>
                          </div>
                          {extraction ? (
                            <p
                              className={`inline-flex w-fit rounded-md border px-2 py-1 text-xs font-semibold ${getFileExtractionTone(extraction.status)}`}
                            >
                              {getFileExtractionLabel(extraction.status)} ·{" "}
                              {extraction.characterCount} chars
                            </p>
                          ) : null}
                        </div>
                        {isPdf ? (
                          <details className="mt-3 rounded-md border bg-background">
                            <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
                              PDF preview
                            </summary>
                            <div className="border-t bg-muted/30 p-2">
                              <iframe
                                src={`/api/files/${fileAsset.id}?disposition=inline#toolbar=1&navpanes=0`}
                                title={`PDF preview for ${fileAsset.originalName}`}
                                className="h-[640px] w-full rounded-md border bg-background"
                              />
                              <p className="mt-2 text-xs text-muted-foreground">
                                If the preview is blank, open the file link above.
                              </p>
                            </div>
                          </details>
                        ) : null}
                        {extraction ? (
                          <details className="mt-3 rounded-md border bg-muted/30 px-3 py-2">
                            <summary className="cursor-pointer text-xs font-medium">
                              Extracted text preview
                            </summary>
                            {extraction.status === "success" ? (
                              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-background p-3 text-xs text-muted-foreground">
                                {truncatePreview(extraction.text)}
                              </pre>
                            ) : (
                              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                {extraction.message ?? extraction.text}
                              </p>
                            )}
                          </details>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <AIReviewForm
            classId={enrollment.class.id}
            slotId={slot.id}
            disabledReason={aiReviewDisabledReason}
            aiReviewState={aiReviewState}
          />

          <AIReviewHistory
            latestVersionId={slot.latestVersionId}
            runs={slot.aiReviewRuns.map((run) => ({
              id: run.id,
              submissionVersionId: run.submissionVersionId,
              provider: run.provider,
              modelName: run.modelName,
              referenceKey: run.referenceKey,
              status: run.status,
              summary: run.summary,
              confidence: run.confidence,
              errorMessage: run.errorMessage,
              createdAtLabel: run.createdAt.toLocaleString(),
              requestedByName: run.requestedBy.name,
              rawResponse: run.rawResponse,
              findings: run.findings.map((finding) => ({
                id: finding.id,
                type: finding.type,
                text: finding.text,
              })),
            }))}
          />

          {slot.status === "final_submitted" ? (
            <ReopenFinalSubmissionForm
              classId={enrollment.class.id}
              slotId={slot.id}
            />
          ) : (
            <TeacherFeedbackForm
              classId={enrollment.class.id}
              slotId={slot.id}
              criterionCode={criterion.code}
              currentStatus={slot.status}
              feedback={feedback}
              queueHref="/teacher/dashboard"
              aiReviewState={aiReviewState}
              nextReviewHref={nextReviewItem?.href}
            />
          )}

          <DeltaReviewPanel
            classId={enrollment.class.id}
            slotId={slot.id}
            disabled={slot.versions.length < 2}
            versionCount={slot.versions.length}
            review={
              latestDeltaReview
                ? {
                    id: latestDeltaReview.id,
                    summary: latestDeltaReview.summary,
                    confidence: latestDeltaReview.confidence,
                    createdAtLabel: latestDeltaReview.createdAt.toLocaleString(),
                    requestedByName:
                      latestDeltaReview.requestedBy.name ??
                      latestDeltaReview.requestedBy.email,
                    previousVersionNumber:
                      latestDeltaReview.previousVersion.versionNumber,
                    currentVersionNumber:
                      latestDeltaReview.currentVersion.versionNumber,
                    resolvedJson: latestDeltaReview.resolvedJson,
                    remainingJson: latestDeltaReview.remainingJson,
                    newEvidenceJson: latestDeltaReview.newEvidenceJson,
                  }
                : null
            }
          />

          <MarkingAssistantPanel
            classId={enrollment.class.id}
            slotId={slot.id}
            disabled={!slot.latestVersionId}
            maxMarks={criterion.maxMarks}
            snapshot={
              latestMarkingSnapshot
                ? {
                    id: latestMarkingSnapshot.id,
                    suggestedMarkMin: latestMarkingSnapshot.suggestedMarkMin,
                    suggestedMarkMax: latestMarkingSnapshot.suggestedMarkMax,
                    suggestedSingleMark:
                      latestMarkingSnapshot.suggestedSingleMark,
                    confidence: latestMarkingSnapshot.confidence,
                    rationale: latestMarkingSnapshot.rationale,
                    createdAtLabel:
                      latestMarkingSnapshot.createdAt.toLocaleString(),
                    requestedByName:
                      latestMarkingSnapshot.requestedBy.name ??
                      latestMarkingSnapshot.requestedBy.email,
                    descriptorEvidenceJson:
                      latestMarkingSnapshot.descriptorEvidenceJson,
                    teacherFinalMark: latestMarkingSnapshot.teacherFinalMark,
                    teacherFinalComment:
                      latestMarkingSnapshot.teacherFinalComment,
                    finalMarkedAtLabel:
                      latestMarkingSnapshot.finalMarkedAt?.toLocaleString() ??
                      null,
                  }
                : null
            }
          />

          <SemanticExtractionPanel
            classId={enrollment.class.id}
            slotId={slot.id}
            disabled={!slot.latestVersionId}
            extraction={
              semanticExtraction
                ? {
                    id: semanticExtraction.id,
                    status: semanticExtraction.status,
                    confidence: semanticExtraction.confidence,
                    sourceCharacterCount:
                      semanticExtraction.sourceCharacterCount,
                    message: semanticExtraction.message,
                    createdAtLabel: semanticExtraction.createdAt.toLocaleString(),
                    confirmedAtLabel:
                      semanticExtraction.confirmedAt?.toLocaleString() ?? null,
                    confirmedByName:
                      semanticExtraction.confirmedBy?.name ??
                      semanticExtraction.confirmedBy?.email ??
                      null,
                    extractedJson: semanticExtraction.extractedJson,
                  }
                : null
              }
          />

          {latestVersion?.feedbackSnapshots.length ? (
            <details className="rounded-md border bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm">
                <span className="font-medium">Feedback history</span>
                <span className="ml-3 text-muted-foreground">
                  {latestVersion.feedbackSnapshots.length} snapshots for latest version
                </span>
              </summary>
              <div className="grid gap-2 border-t px-4 py-3">
                {latestVersion.feedbackSnapshots.map((snapshot) => (
                  <div key={snapshot.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium">
                          {formatFeedbackStatus(snapshot.status)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {snapshot.createdBy.name ?? snapshot.createdBy.email}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {snapshot.sentAt
                          ? `Sent ${snapshot.sentAt.toLocaleString()}`
                          : `Updated ${snapshot.updatedAt.toLocaleString()}`}
                      </p>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-muted-foreground">
                      {snapshot.content}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          {slot.versions.length > 0 ? (
            <details className="rounded-md border bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm">
                <span className="font-medium">Version history</span>
                <span className="ml-3 text-muted-foreground">
                  Latest v{slot.versions[0]?.versionNumber} ·{" "}
                  {slot.versions[0]?.submittedAt.toLocaleString()} ·{" "}
                  {slot.versions.length} total
                </span>
              </summary>
              <div className="border-t px-4 py-3">
                <div className="grid gap-2">
                  {slot.versions.map((version) => (
                    <div key={version.id} className="rounded-md border p-3 text-sm">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="font-medium">Version {version.versionNumber}</p>
                        <p className="text-muted-foreground">
                          Submitted {version.submittedAt.toLocaleString()}
                        </p>
                      </div>
                      {version.fileAssets.length > 0 ? (
                        <div className="mt-2 grid gap-1">
                          {version.fileAssets.map((fileAsset) => (
                            <a
                              key={fileAsset.id}
                              href={`/api/files/${fileAsset.id}`}
                              className="truncate text-primary underline-offset-4 hover:underline"
                            >
                              {fileAsset.originalName} · {formatFileSize(fileAsset.sizeBytes)}
                            </a>
                          ))}
                        </div>
                      ) : null}
                      {version.notes ? (
                        <div className="mt-2 rounded-md bg-muted p-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Student note
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                            {version.notes}
                          </p>
                        </div>
                      ) : null}
                      {version.teacherFeedback ? (
                        <div className="mt-2 rounded-md bg-muted p-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Teacher feedback
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                            {version.teacherFeedback}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </details>
          ) : null}

          {auditLogs.length > 0 ? (
            <details className="rounded-md border bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm">
                <span className="font-medium">Audit history</span>
                <span className="ml-3 text-muted-foreground">
                  Latest {auditLogs.length} events
                </span>
              </summary>
              <div className="border-t px-4 py-3">
                <div className="grid gap-2">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="rounded-md border p-3 text-sm">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-medium">{formatAuditAction(log.action)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {log.actor.name} · {formatAuditActorRole(log.actor.role)}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {log.createdAt.toLocaleString()}
                        </p>
                      </div>
                      {log.fromState || log.toState ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {log.fromState ? formatAuditState(log.fromState) : "No prior state"}{" "}
                          → {log.toState ? formatAuditState(log.toState) : "No state change"}
                        </p>
                      ) : null}
                      {log.reason ? (
                        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          {log.reason}
                        </p>
                      ) : null}
                      {getAuditVersionLabel(log.metadata) ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {getAuditVersionLabel(log.metadata)}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </details>
          ) : null}
        </div>

      </div>
    </main>
  );
}

function getAIReviewWorkflowState(
  latestVersionId: string | null,
  aiReviewSubmissionVersionId: string | null | undefined,
  aiReviewStatus: string | undefined,
): "missing" | "current" | "stale" | "failed" | "pending" {
  if (!latestVersionId || !aiReviewStatus) {
    return "missing";
  }

  if (aiReviewSubmissionVersionId !== latestVersionId) {
    return "stale";
  }

  if (aiReviewStatus === "completed") {
    return "current";
  }

  if (aiReviewStatus === "failed") {
    return "failed";
  }

  return "pending";
}

function getAIReviewDisabledReason({
  status,
  latestVersionId,
  files,
  fileExtractionPreviews,
}: {
  status: SubmissionStatus;
  latestVersionId: string | null;
  files: Array<{ id: string; mimeType: string; originalName: string }>;
  fileExtractionPreviews: Array<{
    fileId: string;
    extraction: { status: string; characterCount: number };
  }>;
}) {
  const runnableStatuses: SubmissionStatus[] = [
    "submitted",
    "under_review",
    "revision_needed",
    "passed",
  ];

  if (!latestVersionId) {
    return "A submitted version is required before AI review can run.";
  }

  if (!runnableStatuses.includes(status)) {
    return `AI review cannot run while this criterion is ${formatSubmissionStatus(status)}.`;
  }

  const pdfFileIds = files
    .filter(isPdfFile)
    .map((fileAsset) => fileAsset.id);

  if (pdfFileIds.length === 0) {
    return "A submitted PDF file is required before AI review can run.";
  }

  const hasReadablePdf = fileExtractionPreviews.some(
    (preview) =>
      pdfFileIds.includes(preview.fileId) &&
      preview.extraction.status === "success" &&
      preview.extraction.characterCount >= 120,
  );

  if (!hasReadablePdf) {
    return "AI review is blocked because the latest PDF does not contain enough readable text.";
  }

  return null;
}

function getFileExtractionTone(status: string) {
  switch (status) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "limited":
    default:
      return "border-amber-200 bg-amber-50 text-amber-800";
  }
}

function getFileExtractionLabel(status: string) {
  return status === "success" ? "Readable" : "Limited extraction";
}

function isPdfFile(fileAsset: { mimeType: string; originalName: string }) {
  return (
    fileAsset.mimeType === "application/pdf" ||
    fileAsset.originalName.toLowerCase().endsWith(".pdf")
  );
}

function truncatePreview(value: string) {
  const maxPreviewLength = 2400;

  return value.length > maxPreviewLength
    ? `${value.slice(0, maxPreviewLength).trim()}\n[preview truncated]`
    : value;
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

function formatAuditAction(action: string) {
  switch (action) {
    case "submission.version_submitted":
      return "Student submitted a version";
    case "submission.note_saved":
      return "Student saved a note";
    case "submission.final_submitted":
      return "Student final-submitted criterion";
    case "review.status_changed":
      return "Teacher changed review status";
    case "review.feedback_saved":
      return "Teacher saved feedback";
    case "review.final_submission_reopened":
      return "Teacher reopened final submission";
    case "ai_review.completed":
      return "AI review completed";
    case "ai_review.failed":
      return "AI review failed";
    case "semantic_extraction.generated":
      return "Semantic extraction generated";
    case "semantic_extraction.failed":
      return "Semantic extraction failed";
    case "semantic_extraction.teacher_confirmed":
      return "Teacher confirmed semantic extraction";
    case "semantic_extraction.student_confirmed":
      return "Student confirmed semantic extraction";
    case "marking_assistant.completed":
      return "Marking assistant completed";
    case "marking.final_mark_saved":
      return "Teacher final mark saved";
    case "delta_review.completed":
      return "Delta review completed";
    default:
      return action
        .split(".")
        .join(" ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
}

function formatFeedbackStatus(status: string) {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAuditState(state: string) {
  const knownStates = [
    "not_started",
    "draft",
    "submitted",
    "under_review",
    "revision_needed",
    "passed",
    "final_submitted",
    "locked",
  ];

  return knownStates.includes(state)
    ? formatSubmissionStatus(state as SubmissionStatus)
    : state;
}

function formatAuditActorRole(role: string) {
  return role
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function getAuditVersionLabel(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const versionNumber = record.versionNumber;
  const fileName = record.fileName;

  if (typeof versionNumber === "number" && typeof fileName === "string") {
    return `Version ${versionNumber} · ${fileName}`;
  }

  if (typeof versionNumber === "number") {
    return `Version ${versionNumber}`;
  }

  if (typeof fileName === "string") {
    return fileName;
  }

  return null;
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
