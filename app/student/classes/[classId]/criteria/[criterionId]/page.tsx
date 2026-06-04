import Link from "next/link";
import { notFound } from "next/navigation";
import type { SubmissionStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FeedbackDisplay } from "@/components/feedback-display";
import { getCurrentUser } from "@/lib/current-user";
import { formatFileSize, maxUploadSizeBytes } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import {
  ensureEnrollmentSubmissionSlots,
  formatSubmissionStatus,
  studentWritableSourceStatuses,
} from "@/lib/submissions";

import { SubmissionForm } from "./submission-form";

export const dynamic = "force-dynamic";

export default async function StudentCriterionSubmissionPage({
  params,
}: {
  params: Promise<{ classId: string; criterionId: string }>;
}) {
  const user = await getCurrentUser();
  const { classId, criterionId } = await params;

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

  const criterion = await prisma.criterionDef.findFirst({
    where: {
      id: criterionId,
      subjectId: classRecord.subjectId,
    },
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

  if (!criterion) {
    notFound();
  }

  const slot = criterion.submissionSlots[0];

  if (!slot) {
    notFound();
  }

  const canEdit = (studentWritableSourceStatuses as readonly string[]).includes(
    slot.status,
  );
  const latestVersion = slot.latestVersion;
  const latestFiles =
    latestVersion?.fileAssets.length ? latestVersion.fileAssets : slot.fileAssets;
  const sentFeedback = latestVersion?.feedbackSnapshots[0];
  const teacherFeedback =
    sentFeedback?.content ?? latestVersion?.teacherFeedback ?? slot.teacherFeedback;
  const reviewedAt = latestVersion?.reviewedAt ?? slot.reviewedAt;
  const statusLabel = formatSubmissionStatus(slot.status);
  const needsRevision = slot.status === "revision_needed";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-10">
      <section>
        <Button asChild variant="ghost" size="sm" className="-ml-3 mb-3">
          <Link href={`/student/classes/${classRecord.id}`}>Back to criteria</Link>
        </Button>
        <p className="text-sm font-medium text-muted-foreground">
          {classRecord.name} · {classRecord.teacher.name}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">
          Criterion {criterion.code}: {criterion.title}
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
          <p className="text-sm text-muted-foreground">
            Criterion {criterion.code} · {criterion.maxMarks} marks
          </p>
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
                ? "Read the feedback, revise your document, then upload a new version."
                : "This feedback is attached to the latest reviewed version."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border bg-white/70 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium">
                  Teacher feedback
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/student/classes/${classRecord.id}/criteria/${criterion.id}/feedback`}>
                    Print feedback
                  </Link>
                </Button>
              </div>
              <FeedbackDisplay content={teacherFeedback} className="mt-3" />
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
              has been sent for this version yet.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {needsRevision
              ? `Submit revised Criterion ${criterion.code}`
              : `Submit Criterion ${criterion.code}`}
          </CardTitle>
          <CardDescription>
            {needsRevision
              ? "Upload a revised PDF to create a new version and return this criterion to your teacher's review queue."
              : "Upload a PDF to create a new submitted version. Notes move into version history after submission."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SubmissionForm
            classId={classRecord.id}
            slotId={slot.id}
            canEdit={canEdit}
            defaultNotes={slot.notes ?? ""}
            submittedLabel={
              slot.submittedAt
                ? `Submitted ${slot.submittedAt.toLocaleString()}`
                : "Not submitted yet"
            }
            criterionCode={criterion.code}
            maxUploadSizeLabel={formatFileSize(maxUploadSizeBytes)}
            isRevisionNeeded={needsRevision}
            latestVersionNumber={latestVersion?.versionNumber}
          />
        </CardContent>
      </Card>

      {latestFiles.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Latest files{latestVersion ? ` · v${latestVersion.versionNumber}` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {latestFiles.map((fileAsset) => (
                <a
                  key={fileAsset.id}
                  href={`/api/files/${fileAsset.id}`}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  {fileAsset.originalName} · {formatFileSize(fileAsset.sizeBytes)}
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
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
              {slot.versions.map((version) => {
                const isLatest = version.id === slot.latestVersionId;
                const versionStatus = getVersionStatusLabel({
                  isLatest,
                  slotStatus: slot.status,
                  reviewedAt: version.reviewedAt,
                  teacherFeedback: version.teacherFeedback,
                });

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
                        {versionStatus}
                      </span>
                    </div>
                    <div className="text-muted-foreground sm:text-right">
                      <p>Submitted {version.submittedAt.toLocaleString()}</p>
                      {version.reviewedAt ? (
                        <p className="mt-1">Reviewed {version.reviewedAt.toLocaleString()}</p>
                      ) : null}
                    </div>
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
                  {version.teacherFeedback ? (
                    <div className="mt-2 rounded-md bg-muted p-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Teacher feedback
                      </p>
                      <FeedbackDisplay content={version.teacherFeedback} className="mt-2 text-muted-foreground" />
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
      return "This criterion has been accepted by your teacher. Keep the final files available for the complete IA submission.";
    case "revision_needed":
      return "Your teacher has requested changes. Upload a revised file and explain what changed.";
    case "submitted":
      return "Your file is submitted and waiting for teacher review.";
    case "under_review":
      return "Your teacher is reviewing this criterion. Editing is locked until feedback is returned.";
    case "not_started":
    case "draft":
    default:
      return "Upload a PDF when this criterion is ready for teacher review.";
  }
}

function getVersionStatusLabel({
  isLatest,
  slotStatus,
  reviewedAt,
  teacherFeedback,
}: {
  isLatest: boolean;
  slotStatus: string;
  reviewedAt: Date | null;
  teacherFeedback: string | null;
}) {
  if (isLatest) {
    return formatSubmissionStatus(slotStatus as SubmissionStatus);
  }

  if (reviewedAt || teacherFeedback) {
    return "Reviewed";
  }

  return "Submitted";
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
