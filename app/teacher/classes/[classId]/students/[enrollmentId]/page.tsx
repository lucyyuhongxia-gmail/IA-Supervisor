import Link from "next/link";
import { notFound } from "next/navigation";
import type { SubmissionStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/current-user";
import { formatFileSize } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import {
  ensureClassSubmissionSlots,
  formatSubmissionStatus,
} from "@/lib/submissions";

import { ConsistencyReviewPanel } from "./consistency-review-panel";

export const dynamic = "force-dynamic";

export default async function TeacherStudentPage({
  params,
}: {
  params: Promise<{ classId: string; enrollmentId: string }>;
}) {
  const user = await getCurrentUser();
  const { classId, enrollmentId } = await params;

  if (!user) {
    return <AccessMessage title="Sign in required" description="Use a teacher account to review this student." />;
  }

  if (user.role !== "teacher") {
    return <AccessMessage title="Teacher account required" description="This page is reserved for teachers." />;
  }

  const classAccess = await prisma.class.findFirst({
    where: {
      id: classId,
      teacherId: user.id,
    },
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
      class: {
        teacherId: user.id,
      },
    },
    include: {
      student: { select: { name: true, email: true } },
      class: {
        include: {
          subject: {
            include: {
              criteria: { orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
      deliverableSlots: {
        include: {
          deliverable: {
            include: {
              criteria: {
                orderBy: { sortOrder: "asc" },
                include: {
                  criterion: true,
                },
              },
            },
          },
          latestVersion: {
            include: {
              fileAssets: {
                orderBy: { createdAt: "desc" },
              },
            },
          },
          fileAssets: {
            orderBy: { createdAt: "desc" },
          },
        },
      },
      submissionSlots: {
        include: {
          criterion: true,
          latestVersion: {
            include: {
              fileAssets: {
                orderBy: { createdAt: "desc" },
              },
            },
          },
          versions: {
            orderBy: { versionNumber: "desc" },
            include: {
              fileAssets: {
                orderBy: { createdAt: "desc" },
              },
            },
          },
          fileAssets: {
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
  });

  if (!enrollment) {
    notFound();
  }

  const sortedSlots = [...enrollment.submissionSlots].sort(
    (a, b) => a.criterion.sortOrder - b.criterion.sortOrder,
  );
  const sortedDeliverableSlots = [...enrollment.deliverableSlots].sort(
    (a, b) => a.deliverable.sortOrder - b.deliverable.sortOrder,
  );
  const reviewFocusSlots = sortedSlots.filter((slot) =>
    ["submitted", "under_review", "revision_needed"].includes(slot.status),
  );
  const latestConsistencyRun = await prisma.consistencyCheck.findFirst({
    where: {
      classId,
      enrollmentId: enrollment.id,
    },
    orderBy: { createdAt: "desc" },
    select: { runId: true },
  });
  const consistencyChecks = latestConsistencyRun
    ? await prisma.consistencyCheck.findMany({
        where: {
          runId: latestConsistencyRun.runId,
        },
        orderBy: { createdAt: "asc" },
        include: {
          sourceCriterion: { select: { code: true } },
          targetCriterion: { select: { code: true } },
          requestedBy: { select: { name: true, email: true } },
        },
      })
    : [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-3">
            <Link href={`/teacher/classes/${enrollment.class.id}`}>Back to students</Link>
          </Button>
          <p className="text-sm font-medium text-muted-foreground">
            {enrollment.class.name} · {enrollment.class.subject.name}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">
            {enrollment.student.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {enrollment.student.email} · Joined {enrollment.enrolledAt.toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/teacher/classes/${enrollment.class.id}/students/${enrollment.id}/report`}>
              View report
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/teacher/classes/${enrollment.class.id}`}>
              Class student list
            </Link>
          </Button>
        </div>
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-lg">Review focus</CardTitle>
              <CardDescription>
                Items for this student that currently need teacher attention.
              </CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/teacher/dashboard">Review queue</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {reviewFocusSlots.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {reviewFocusSlots.map((slot) => (
                <Link
                  key={slot.id}
                  href={`/teacher/classes/${enrollment.class.id}/students/${enrollment.id}/criteria/${slot.criterion.id}`}
                  className="rounded-md border p-3 text-sm transition-colors hover:bg-muted/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">Criterion {slot.criterion.code}</p>
                      <p className="mt-1 text-muted-foreground">
                        {slot.latestVersion
                          ? `v${slot.latestVersion.versionNumber} · ${slot.latestVersion.submittedAt.toLocaleDateString()}`
                          : "No submitted version"}
                      </p>
                    </div>
                    <p
                      className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${getStatusTone(slot.status)}`}
                    >
                      {formatReviewFocusStatus(slot.status)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No active review items for this student.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Submission status</CardTitle>
          <CardDescription>
            Criterion-level progress for this student.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-5">
            {enrollment.class.subject.criteria.map((criterion) => {
              const slot = sortedSlots.find(
                (submissionSlot) => submissionSlot.criterionId === criterion.id,
              );

              return (
                <div key={criterion.id} className="rounded-md border p-3 text-sm">
                  <p className="font-medium">Criterion {criterion.code}</p>
                  <p
                    className={`mt-2 inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${getStatusTone(slot?.status ?? "not_started")}`}
                  >
                    {slot ? formatSubmissionStatus(slot.status) : "Not Started"}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {sortedDeliverableSlots.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Submission plan</CardTitle>
            <CardDescription>
              Deliverable-level files expected for this student.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2">
              {sortedDeliverableSlots.map((slot) => {
                const latestVersion = slot.latestVersion;
                const files =
                  latestVersion?.fileAssets.length
                    ? latestVersion.fileAssets
                    : slot.fileAssets;
                const artifactUrl = latestVersion?.artifactUrl ?? slot.artifactUrl;

                return (
                  <div key={slot.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{slot.deliverable.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {slot.deliverable.criteria
                            .map((link) => `Criterion ${link.criterion.code}`)
                            .join(", ") || "General deliverable"}
                        </p>
                      </div>
                      <p
                        className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${getStatusTone(slot.status)}`}
                      >
                        {formatSubmissionStatus(slot.status)}
                      </p>
                    </div>
                    {latestVersion ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Latest v{latestVersion.versionNumber} ·{" "}
                        {latestVersion.submittedAt.toLocaleString()}
                      </p>
                    ) : null}
                    {files.length > 0 ? (
                      <div className="mt-2 grid gap-1">
                        {files.map((fileAsset) => (
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
                    {artifactUrl ? (
                      <a
                        href={artifactUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block break-all text-primary underline-offset-4 hover:underline"
                      >
                        {artifactUrl}
                      </a>
                    ) : null}
                    <Button asChild size="sm" className="mt-3">
                      <Link
                        href={`/teacher/classes/${enrollment.class.id}/students/${enrollment.id}/deliverables/${slot.deliverable.id}`}
                      >
                        Open review
                      </Link>
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <details className="rounded-md border bg-card">
        <summary className="cursor-pointer px-6 py-4">
          <span className="font-medium">Consistency review</span>
          <span className="ml-3 text-sm text-muted-foreground">
            Cross-criterion checks and evidence alignment
          </span>
        </summary>
        <div className="border-t p-4">
          <ConsistencyReviewPanel
            classId={enrollment.class.id}
            enrollmentId={enrollment.id}
            checks={consistencyChecks.map((check) => ({
              id: check.id,
              checkType: check.checkType,
              status: check.status,
              severity: check.severity,
              summary: check.summary,
              createdAtLabel: check.createdAt.toLocaleString(),
              evidenceJson: check.evidenceJson,
              sourceCriterionCode: check.sourceCriterion?.code ?? null,
              targetCriterionCode: check.targetCriterion?.code ?? null,
              requestedByName: check.requestedBy.name ?? check.requestedBy.email,
            }))}
          />
        </div>
      </details>

      <details className="rounded-md border bg-card">
        <summary className="cursor-pointer px-6 py-4">
          <span className="font-medium">All criterion details</span>
          <span className="ml-3 text-sm text-muted-foreground">
            Files, feedback, and version history for criteria A-E
          </span>
        </summary>
        <div className="grid gap-4 border-t p-4">
        {enrollment.class.subject.criteria.map((criterion) => {
          const slot = sortedSlots.find(
            (submissionSlot) => submissionSlot.criterionId === criterion.id,
          );
          const latestVersion = slot?.latestVersion;
          const files =
            latestVersion?.fileAssets.length
              ? latestVersion.fileAssets
              : slot?.fileAssets ?? [];
          const feedback =
            latestVersion?.teacherFeedback ?? slot?.teacherFeedback ?? "";
          const reviewedAt = latestVersion?.reviewedAt ?? slot?.reviewedAt;

          return (
            <Card key={criterion.id} id={`criterion-${criterion.code.toLowerCase()}`}>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-lg">
                      Criterion {criterion.code}: {criterion.title}
                    </CardTitle>
                    <CardDescription>{criterion.maxMarks} marks</CardDescription>
                  </div>
                  <p
                    className={`inline-flex rounded-md border px-3 py-2 text-sm font-semibold ${getStatusTone(slot?.status ?? "not_started")}`}
                  >
                    {slot ? formatSubmissionStatus(slot.status) : "Not Started"}
                  </p>
                </div>
              </CardHeader>
              <CardContent>
                {slot ? (
                  <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
                    <div className="grid gap-4">
                      {latestVersion ? (
                        <div className="rounded-md border p-3 text-sm">
                          <p className="font-medium">
                            Latest version: v{latestVersion.versionNumber}
                          </p>
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

                      {files.length > 0 ? (
                        <div className="rounded-md border p-3 text-sm">
                          <p className="font-medium">Latest files</p>
                          <div className="mt-2 grid gap-1">
                            {files.map((fileAsset) => (
                              <a
                                key={fileAsset.id}
                                href={`/api/files/${fileAsset.id}`}
                                className="truncate text-primary underline-offset-4 hover:underline"
                              >
                                {fileAsset.originalName} ·{" "}
                                {formatFileSize(fileAsset.sizeBytes)}
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {slot.versions.length > 0 ? (
                        <details className="rounded-md border text-sm">
                          <summary className="cursor-pointer px-3 py-2">
                            <span className="font-medium">Version history</span>
                            <span className="ml-3 text-muted-foreground">
                              Latest v{slot.versions[0]?.versionNumber} ·{" "}
                              {slot.versions[0]?.submittedAt.toLocaleString()} ·{" "}
                              {slot.versions.length} total
                            </span>
                          </summary>
                          <div className="grid gap-2 border-t p-3">
                            {slot.versions.map((version) => (
                              <div key={version.id} className="rounded-md bg-muted p-3">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                  <p className="font-medium">v{version.versionNumber}</p>
                                  <p className="text-muted-foreground">
                                    Submitted {version.submittedAt.toLocaleString()}
                                  </p>
                                </div>
                                {version.fileAssets.map((fileAsset) => (
                                  <a
                                    key={fileAsset.id}
                                    href={`/api/files/${fileAsset.id}`}
                                    className="mt-2 block truncate text-primary underline-offset-4 hover:underline"
                                  >
                                    {fileAsset.originalName} · {formatFileSize(fileAsset.sizeBytes)}
                                  </a>
                                ))}
                                {version.notes ? (
                                  <div className="mt-2 rounded-md bg-background p-2">
                                    <p className="text-xs font-medium text-muted-foreground">
                                      Student note
                                    </p>
                                    <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                                      {version.notes}
                                    </p>
                                  </div>
                                ) : null}
                                {version.teacherFeedback ? (
                                  <div className="mt-2 rounded-md bg-background p-2">
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
                        </details>
                      ) : null}
                    </div>

                    <div className="grid content-start gap-3 rounded-md border p-3 text-sm">
                      <p className="font-medium">Criterion review</p>
                      <p className="text-muted-foreground">
                        Open the focused review page to update status and feedback.
                      </p>
                      {feedback ? (
                        <div className="rounded-md bg-muted p-2">
                          <p className="text-xs font-medium text-muted-foreground">
                            Current feedback
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                            {feedback}
                          </p>
                        </div>
                      ) : null}
                      <Button asChild size="sm">
                        <Link
                          href={`/teacher/classes/${enrollment.class.id}/students/${enrollment.id}/criteria/${criterion.id}`}
                        >
                          Open Criterion {criterion.code} review
                        </Link>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This criterion slot has not been initialized yet.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
        </div>
      </details>
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

function formatReviewFocusStatus(status: SubmissionStatus) {
  switch (status) {
    case "submitted":
      return "Awaiting";
    case "under_review":
      return "In review";
    case "revision_needed":
      return "Needs revision";
    default:
      return formatSubmissionStatus(status);
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
