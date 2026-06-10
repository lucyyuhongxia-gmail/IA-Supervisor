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
import {
  ensureClassSubmissionSlots,
  formatSubmissionStatus,
} from "@/lib/submissions";

import { DeliverableFeedbackForm } from "./deliverable-feedback-form";

export const dynamic = "force-dynamic";

export default async function TeacherDeliverableReviewPage({
  params,
}: {
  params: Promise<{ classId: string; enrollmentId: string; deliverableId: string }>;
}) {
  const user = await getCurrentUser();
  const { classId, enrollmentId, deliverableId } = await params;

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

  const deliverable = await prisma.classDeliverable.findFirst({
    where: {
      id: deliverableId,
      classId,
      isArchived: false,
    },
    include: {
      criteria: {
        orderBy: { sortOrder: "asc" },
        include: {
          criterion: true,
        },
      },
    },
  });

  if (!deliverable) {
    notFound();
  }

  const slot = await prisma.deliverableSubmissionSlot.findFirst({
    where: {
      enrollmentId: enrollment.id,
      deliverableId: deliverable.id,
    },
    include: {
      latestVersion: {
        include: {
          fileAssets: { orderBy: { createdAt: "desc" } },
        },
      },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          fileAssets: { orderBy: { createdAt: "desc" } },
        },
      },
      fileAssets: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!slot) {
    notFound();
  }

  const latestVersion = slot.latestVersion;
  const files =
    latestVersion?.fileAssets.length ? latestVersion.fileAssets : slot.fileAssets;
  const artifactUrl = latestVersion?.artifactUrl ?? slot.artifactUrl;
  const feedback = latestVersion?.teacherFeedback ?? slot.teacherFeedback ?? "";
  const reviewedAt = latestVersion?.reviewedAt ?? slot.reviewedAt;
  const fileExtractionPreviews = await Promise.all(
    files.map(async (fileAsset) => ({
      fileId: fileAsset.id,
      extraction: await extractFileText(fileAsset),
    })),
  );
  const fileExtractionPreviewsById = new Map(
    fileExtractionPreviews.map((preview) => [preview.fileId, preview.extraction]),
  );
  const auditLogs = await prisma.auditLog.findMany({
    where: {
      entityType: "deliverable_submission_slot",
      entityId: slot.id,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      actor: { select: { name: true, email: true, role: true } },
    },
  });
  const studentHref = `/teacher/classes/${classId}/students/${enrollment.id}`;
  const classHref = `/teacher/classes/${classId}`;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-6 py-8">
      <section className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link href={studentHref}>Back to student</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={classHref}>Class dashboard</Link>
          </Button>
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {enrollment.class.name} · {enrollment.student.name}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">
              {deliverable.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span
                className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${getStatusTone(slot.status)}`}
              >
                {formatSubmissionStatus(slot.status)}
              </span>
              <span className="rounded-md border px-2 py-1 text-xs text-muted-foreground">
                {formatReviewMode(deliverable.reviewMode)}
              </span>
              {latestVersion ? (
                <span className="rounded-md border px-2 py-1 text-xs text-muted-foreground">
                  Latest v{latestVersion.versionNumber}
                </span>
              ) : null}
              <span className="text-muted-foreground">{enrollment.student.email}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {deliverable.criteria.map((link) => (
              <span
                key={link.id}
                className="rounded-md border bg-background px-2 py-1 text-xs font-medium"
              >
                {`Criterion ${link.criterion.code}: ${link.criterion.title}`}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <div className="grid min-w-0 gap-4">
          <Card>
            <CardHeader className="p-4 pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-lg">Submitted evidence</CardTitle>
                  <CardDescription>
                    Review this deliverable file or evidence link.
                  </CardDescription>
                </div>
                <span className="inline-flex w-fit rounded-md border px-2 py-1 text-xs font-semibold text-muted-foreground">
                  {files.length} {files.length === 1 ? "file" : "files"}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {files.length > 0 || artifactUrl ? (
                <div className="grid gap-3">
                  {artifactUrl ? (
                    <div className="rounded-md border p-3 text-sm">
                      <p className="text-xs font-medium text-muted-foreground">
                        Evidence link
                      </p>
                      <a
                        href={artifactUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block break-all font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {artifactUrl}
                      </a>
                    </div>
                  ) : null}

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
              ) : (
                <p className="rounded-md border p-3 text-sm text-muted-foreground">
                  No submitted evidence yet.
                </p>
              )}
            </CardContent>
          </Card>

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
              <div className="grid gap-2 border-t p-4">
                {slot.versions.map((version) => (
                  <div key={version.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="font-medium">Version {version.versionNumber}</p>
                      <p className="text-muted-foreground">
                        Submitted {version.submittedAt.toLocaleString()}
                      </p>
                    </div>
                    {version.artifactUrl ? (
                      <a
                        href={version.artifactUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block break-all text-primary underline-offset-4 hover:underline"
                      >
                        {version.artifactUrl}
                      </a>
                    ) : null}
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
              </div>
            </details>
          ) : null}

          {auditLogs.length > 0 ? (
            <details className="rounded-md border bg-card">
              <summary className="cursor-pointer px-4 py-3 text-sm">
                <span className="font-medium">Audit history</span>
                <span className="ml-3 text-muted-foreground">
                  {auditLogs.length} recent events
                </span>
              </summary>
              <div className="grid gap-2 border-t p-4">
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
                        {log.fromState ? formatSubmissionStatus(log.fromState as SubmissionStatus) : "No prior state"}{" "}
                        → {log.toState ? formatSubmissionStatus(log.toState as SubmissionStatus) : "No state change"}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>

        <aside className="grid gap-3 lg:sticky lg:top-24">
          <DeliverableFeedbackForm
            classId={enrollment.class.id}
            deliverableSlotId={slot.id}
            currentStatus={slot.status}
            feedback={feedback}
            queueHref={classHref}
            studentHref={studentHref}
            latestVersionLabel={
              latestVersion
                ? `Latest version: v${latestVersion.versionNumber}`
                : "No submitted version yet"
            }
            latestSubmittedLabel={
              latestVersion
                ? `Submitted ${latestVersion.submittedAt.toLocaleString()}`
                : undefined
            }
            reviewedLabel={
              reviewedAt ? `Reviewed ${reviewedAt.toLocaleString()}` : null
            }
          />
        </aside>
      </div>
    </main>
  );
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

function isPdfFile(fileAsset: { mimeType: string; originalName: string }) {
  return (
    fileAsset.mimeType === "application/pdf" ||
    fileAsset.originalName.toLowerCase().endsWith(".pdf")
  );
}

function getFileExtractionLabel(status: string) {
  switch (status) {
    case "success":
      return "Readable";
    case "empty":
      return "No text";
    case "unsupported":
      return "Unsupported";
    case "error":
    default:
      return "Limited";
  }
}

function getFileExtractionTone(status: string) {
  switch (status) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "empty":
    case "unsupported":
    case "error":
    default:
      return "border-amber-200 bg-amber-50 text-amber-800";
  }
}

function truncatePreview(text: string) {
  const maxLength = 4000;

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}\n\n[Preview truncated]`;
}

function formatAuditAction(action: string) {
  return action
    .split(".")
    .map((part) => part.replaceAll("_", " "))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" · ");
}

function formatAuditActorRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
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
