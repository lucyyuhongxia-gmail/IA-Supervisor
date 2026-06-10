import Link from "next/link";
import { notFound } from "next/navigation";

import { FeedbackDisplay } from "@/components/feedback-display";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/current-user";
import { formatFileSize, maxUploadSizeBytes } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import {
  ensureEnrollmentSubmissionSlots,
  formatSubmissionStatus,
  studentWritableSourceStatuses,
} from "@/lib/submissions";

import { DeliverableSubmissionForm } from "./submission-form";

export const dynamic = "force-dynamic";

export default async function StudentDeliverableSubmissionPage({
  params,
}: {
  params: Promise<{ classId: string; deliverableId: string }>;
}) {
  const user = await getCurrentUser();
  const { classId, deliverableId } = await params;

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
      subject: true,
      teacher: { select: { name: true, email: true } },
    },
  });

  if (!classRecord) {
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
      submissionSlots: {
        where: { enrollmentId: enrollment.id },
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
      },
    },
  });

  if (!deliverable) {
    notFound();
  }

  const slot = deliverable.submissionSlots[0];

  if (!slot) {
    notFound();
  }

  const canEdit = (studentWritableSourceStatuses as readonly string[]).includes(
    slot.status,
  );
  const latestVersion = slot.latestVersion;
  const latestFiles =
    latestVersion?.fileAssets.length ? latestVersion.fileAssets : slot.fileAssets;
  const latestArtifactUrl = latestVersion?.artifactUrl ?? slot.artifactUrl;
  const teacherFeedback =
    latestVersion?.teacherFeedback ?? slot.teacherFeedback;
  const reviewedAt = latestVersion?.reviewedAt ?? slot.reviewedAt;
  const statusLabel = formatSubmissionStatus(slot.status);
  const needsRevision = slot.status === "revision_needed";
  const allowsLink = isLinkDeliverable(deliverable.fileRequirement);
  const requiresPdf =
    !allowsLink ||
    Boolean(deliverable.fileRequirement?.toLowerCase().includes("pdf"));

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-10">
      <section>
        <Button asChild variant="ghost" size="sm" className="-ml-3 mb-3">
          <Link href={`/student/classes/${classRecord.id}`}>Back to class</Link>
        </Button>
        <p className="text-sm font-medium text-muted-foreground">
          {classRecord.name} · {classRecord.teacher.name}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">
          {deliverable.title}
        </h1>
        <div className="mt-4 flex flex-col gap-3 rounded-md border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Current status
            </p>
            <p className={`mt-1 inline-flex rounded-md border px-3 py-2 text-2xl font-semibold tracking-normal ${getStudentStatusTone(slot.status)}`}>
              {statusLabel}
            </p>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {getStudentStatusMessage(slot.status)}
            </p>
          </div>
          <div className="grid gap-2 text-sm text-muted-foreground sm:justify-items-end">
            <p>{formatReviewMode(deliverable.reviewMode)}</p>
            {deliverable.fileRequirement ? <p>{deliverable.fileRequirement}</p> : null}
          </div>
        </div>
      </section>

      {teacherFeedback ? (
        <Card className={needsRevision ? "border-amber-200 bg-amber-50" : "border-blue-200 bg-blue-50"}>
          <CardHeader>
            <CardTitle className={`text-lg ${needsRevision ? "text-amber-950" : "text-blue-950"}`}>
              {needsRevision ? "Revision needed" : "Teacher feedback"}
            </CardTitle>
            <CardDescription className={needsRevision ? "text-amber-900" : "text-blue-900"}>
              {needsRevision
                ? "Read the feedback, revise this deliverable, then submit a new version."
                : "This feedback is attached to the latest reviewed version."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border bg-white/70 p-4">
              <FeedbackDisplay content={teacherFeedback} />
              {reviewedAt ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Reviewed {reviewedAt.toLocaleString()}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : needsRevision ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="text-lg text-amber-950">
              Revision needed
            </CardTitle>
            <CardDescription className="text-amber-900">
              Your teacher requested a revision, but no student-visible feedback
              has been sent for this deliverable yet.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {needsRevision ? `Submit revised ${deliverable.title}` : `Submit ${deliverable.title}`}
          </CardTitle>
          <CardDescription>
            {needsRevision
              ? "Submit a revised version and explain what changed."
              : "Submit the file or evidence link required for this deliverable."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeliverableSubmissionForm
            classId={classRecord.id}
            deliverableSlotId={slot.id}
            canEdit={canEdit}
            defaultArtifactUrl={slot.artifactUrl ?? ""}
            defaultNotes={slot.notes ?? ""}
            submittedLabel={
              slot.submittedAt
                ? `Submitted ${slot.submittedAt.toLocaleString()}`
                : "Not submitted yet"
            }
            deliverableTitle={deliverable.title}
            maxUploadSizeLabel={formatFileSize(maxUploadSizeBytes)}
            allowsLink={allowsLink}
            requiresPdf={requiresPdf}
            isRevisionNeeded={needsRevision}
            latestVersionNumber={latestVersion?.versionNumber}
          />
        </CardContent>
      </Card>

      {latestFiles.length > 0 || latestArtifactUrl ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Latest submission{latestVersion ? ` · v${latestVersion.versionNumber}` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 text-sm">
              {latestFiles.map((fileAsset) => (
                <a
                  key={fileAsset.id}
                  href={`/api/files/${fileAsset.id}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {fileAsset.originalName} · {formatFileSize(fileAsset.sizeBytes)}
                </a>
              ))}
              {latestArtifactUrl ? (
                <a
                  href={latestArtifactUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all text-primary underline-offset-4 hover:underline"
                >
                  {latestArtifactUrl}
                </a>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Linked criteria</CardTitle>
          <CardDescription>
            This deliverable provides evidence for the following assessment criteria.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {deliverable.criteria.map((link) => (
              <span
                key={link.id}
                className="rounded-md border bg-background px-2 py-1 text-sm font-medium"
              >
                {`Criterion ${link.criterion.code}: ${link.criterion.title}`}
              </span>
            ))}
          </div>
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
          <div className="border-t px-4 py-3">
            <div className="grid gap-2">
              {slot.versions.map((version) => {
                const isLatest = version.id === slot.latestVersionId;

                return (
                  <div key={version.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">Version {version.versionNumber}</p>
                        {isLatest ? (
                          <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">
                            Current
                          </span>
                        ) : null}
                        <span className="rounded-md border px-2 py-1 text-xs font-semibold text-muted-foreground">
                          {isLatest
                            ? formatSubmissionStatus(slot.status)
                            : "Submitted"}
                        </span>
                      </div>
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
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            {fileAsset.originalName} · {formatFileSize(fileAsset.sizeBytes)}
                          </a>
                        ))}
                      </div>
                    ) : null}
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
                    {version.notes ? (
                      <div className="mt-2 rounded-md bg-muted p-2">
                        <p className="text-xs font-medium text-muted-foreground">
                          {version.versionNumber > 1 ? "What changed" : "Note to teacher"}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                          {version.notes}
                        </p>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </details>
      ) : null}
    </main>
  );
}

function isLinkDeliverable(fileRequirement: string | null) {
  const normalized = fileRequirement?.toLowerCase() ?? "";

  return normalized.includes("link") || normalized.includes("video");
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

function getStudentStatusTone(status: string) {
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

function getStudentStatusMessage(status: string) {
  switch (status) {
    case "passed":
    case "final_submitted":
      return "This deliverable has been accepted by your teacher.";
    case "revision_needed":
      return "Your teacher has requested changes. Submit a revised version and explain what changed.";
    case "submitted":
      return "This deliverable is submitted and waiting for teacher review.";
    case "under_review":
      return "Your teacher is reviewing this deliverable. Editing is locked until feedback is returned.";
    case "not_started":
    case "draft":
    default:
      return "Submit the required file or evidence link when this deliverable is ready.";
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
