import Link from "next/link";
import { notFound } from "next/navigation";
import type { SubmissionStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FeedbackDisplay } from "@/components/feedback-display";
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
  const feedback = feedbackDraft?.content ?? "";
  const reviewedAt = latestVersion?.reviewedAt ?? slot.reviewedAt;
  const reviewQueue = await getTeacherReviewQueue(user.id);
  const currentQueueIndex = reviewQueue.findIndex(
    (item) => item.itemType === "criterion" && item.id === slot.id,
  );
  const nextReviewItem =
    currentQueueIndex >= 0
      ? reviewQueue[currentQueueIndex + 1]
      : reviewQueue.find((item) => item.id !== slot.id);
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
  const readableFileCount = fileExtractionPreviews.filter(
    (preview) => preview.extraction.status === "success",
  ).length;
  const latestVersionLabel = latestVersion
    ? `v${latestVersion.versionNumber}`
    : "No version";
  const latestSubmittedLabel = latestVersion
    ? latestVersion.submittedAt.toLocaleString()
    : "Not submitted";
  const reviewedLabel = reviewedAt ? reviewedAt.toLocaleString() : "Not reviewed";
  const nextReviewLabel = nextReviewItem
    ? `${nextReviewItem.studentName} · ${nextReviewItem.className} · ${nextReviewItem.reviewTitle}`
    : "No next active item";
  const studentHref = `/teacher/classes/${classId}/students/${enrollment.id}`;
  const classHref = `/teacher/classes/${classId}`;
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
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 px-6 py-6">
      <section className="rounded-md border bg-card p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="ghost" size="sm" className="-ml-3">
                <Link href={studentHref}>
                  Back to student
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={classHref}>Class dashboard</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/teacher/dashboard">Review queue</Link>
              </Button>
              {nextReviewItem ? (
                <Button asChild size="sm">
                  <Link href={nextReviewItem.href}>Next review item</Link>
                </Button>
              ) : null}
            </div>
            <p className="mt-4 text-sm font-medium text-muted-foreground">
              {enrollment.class.name} · {enrollment.student.name} · {enrollment.student.email}
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal">
              Criterion {criterion.code}: {criterion.title}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <span
              className={`inline-flex rounded-md border px-3 py-2 text-sm font-semibold ${getStatusTone(slot.status)}`}
            >
              {formatSubmissionStatus(slot.status)}
            </span>
            <span className="inline-flex rounded-md border px-3 py-2 text-sm text-muted-foreground">
              {criterion.maxMarks} marks
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <SummaryTile label="Latest version" value={latestVersionLabel} detail={latestSubmittedLabel} />
          <SummaryTile
            label="Readable files"
            value={`${readableFileCount}/${files.length}`}
            detail={files.length === 1 ? "submitted file" : "submitted files"}
          />
          <SummaryTile label="Teacher review" value={formatSubmissionStatus(slot.status)} detail={reviewedLabel} />
          <SummaryTile label="Next queue item" value={nextReviewItem ? "Available" : "None"} detail={nextReviewLabel} />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
        <div className="grid min-w-0 gap-4">
          <Card id="submitted-evidence">
            <CardHeader className="p-4 pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Step 1
                  </p>
                  <CardTitle className="mt-1 text-lg">Check submitted evidence</CardTitle>
                  <CardDescription>
                    Open the PDF and confirm readable text before relying on AI notes.
                  </CardDescription>
                </div>
                <span className="inline-flex w-fit rounded-md border px-2 py-1 text-xs font-semibold text-muted-foreground">
                  {files.length} {files.length === 1 ? "file" : "files"}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {files.length > 0 ? (
                <div className="grid gap-3">
                  {files.map((fileAsset, fileIndex) => {
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
                          <details
                            className="mt-3 rounded-md border bg-background"
                            open={fileIndex === 0}
                          >
                            <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
                              PDF preview
                            </summary>
                            <div className="border-t bg-muted/30 p-2">
                              <iframe
                                src={`/api/files/${fileAsset.id}?disposition=inline#toolbar=1&navpanes=0`}
                                title={`PDF preview for ${fileAsset.originalName}`}
                                className="h-[720px] w-full rounded-md border bg-background"
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
              ) : (
                <p className="rounded-md border p-3 text-sm text-muted-foreground">
                  No submitted files yet.
                </p>
              )}
            </CardContent>
          </Card>

          <section id="ai-review" className="grid gap-3">
            <div className="rounded-md border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Step 2
              </p>
              <h2 className="mt-1 text-lg font-semibold tracking-normal">
                Run and review AI support
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Generate draft notes, check evidence grounding, then copy only useful parts into teacher feedback.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)] xl:items-start">
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
            </div>
          </section>

          <details className="rounded-md border bg-card">
            <summary className="cursor-pointer px-4 py-3 text-sm">
              <span className="font-medium">More review tools</span>
              <span className="ml-3 text-muted-foreground">
                Semantic extraction, version delta, and marking assistant
              </span>
            </summary>
            <div className="grid gap-4 border-t p-4">
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
            </div>
          </details>

          <details className="rounded-md border bg-card">
            <summary className="cursor-pointer px-4 py-3 text-sm">
              <span className="font-medium">History</span>
              <span className="ml-3 text-muted-foreground">
                Feedback snapshots, versions, and audit events
              </span>
            </summary>
            <div className="grid gap-4 border-t p-4">
              {latestVersion?.feedbackSnapshots.length ? (
                <section className="grid gap-2">
                  <h2 className="text-sm font-semibold">Feedback history</h2>
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
                      <FeedbackDisplay content={snapshot.content} className="mt-3 text-muted-foreground" />
                    </div>
                  ))}
                </section>
              ) : null}

              {slot.versions.length > 0 ? (
                <section className="grid gap-2">
                  <h2 className="text-sm font-semibold">Version history</h2>
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
                          <FeedbackDisplay content={version.teacherFeedback} className="mt-2 text-muted-foreground" />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </section>
              ) : null}

              {auditLogs.length > 0 ? (
                <section className="grid gap-2">
                  <h2 className="text-sm font-semibold">Audit history</h2>
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
                </section>
              ) : null}
            </div>
          </details>
        </div>

        <aside className="grid gap-3 lg:sticky lg:top-20">
          <div className="rounded-md border bg-muted/30 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Step 3
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-normal">
              Decide teacher feedback
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Edit the final message, choose the review status, and send feedback when it should be visible to the student.
            </p>
          </div>

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
              latestVersionLabel={
                latestVersion
                  ? `Latest version: ${latestVersionLabel}`
                  : "No submitted version yet"
              }
              latestSubmittedLabel={
                latestVersion ? `Submitted ${latestSubmittedLabel}` : undefined
              }
              reviewedLabel={
                reviewedAt ? `Reviewed ${reviewedLabel}` : null
              }
            />
          )}
        </aside>
      </div>
    </main>
  );
}

function SummaryTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
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
