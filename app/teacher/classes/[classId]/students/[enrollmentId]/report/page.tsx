import Link from "next/link";
import { notFound } from "next/navigation";
import type { ConsistencyCheckSeverity, ConsistencyCheckStatus, SubmissionStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/current-user";
import { formatFileSize } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { ensureClassSubmissionSlots, formatSubmissionStatus } from "@/lib/submissions";

import { PrintReportButton } from "./print-report-button";

export const dynamic = "force-dynamic";

type ReportStatus = SubmissionStatus | "not_started";
type ReadinessIssue = {
  label: string;
  detail: string;
};

export default async function TeacherStudentReportPage({
  params,
}: {
  params: Promise<{ classId: string; enrollmentId: string }>;
}) {
  const user = await getCurrentUser();
  const { classId, enrollmentId } = await params;

  if (!user) {
    return <AccessMessage title="Sign in required" description="Use a teacher account to view this report." />;
  }

  if (user.role !== "teacher") {
    return <AccessMessage title="Teacher account required" description="Student reports are reserved for teachers." />;
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
          teacher: { select: { name: true, email: true } },
          subject: {
            include: {
              criteria: { orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
      submissionSlots: {
        include: {
          criterion: true,
          latestVersion: {
            include: {
              fileAssets: { orderBy: { createdAt: "desc" } },
              feedbackSnapshots: {
                where: { status: "sent" },
                orderBy: { sentAt: "desc" },
                take: 1,
                include: {
                  createdBy: { select: { name: true, email: true } },
                },
              },
            },
          },
          fileAssets: { orderBy: { createdAt: "desc" } },
          markingSnapshots: {
            where: { teacherFinalMark: { not: null } },
            orderBy: { finalMarkedAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!enrollment) {
    notFound();
  }

  const sortedCriteria = enrollment.class.subject.criteria;
  const slotsByCriterionId = new Map(
    enrollment.submissionSlots.map((slot) => [slot.criterionId, slot]),
  );
  const rows = sortedCriteria.map((criterion) => {
    const slot = slotsByCriterionId.get(criterion.id);
    const latestVersion = slot?.latestVersion ?? null;
    const files =
      latestVersion?.fileAssets.length
        ? latestVersion.fileAssets
        : slot?.fileAssets ?? [];
    const sentFeedback = latestVersion?.feedbackSnapshots[0] ?? null;
    const finalMark = slot?.markingSnapshots[0] ?? null;

    return {
      criterion,
      slot,
      latestVersion,
      files,
      sentFeedback,
      feedbackContent:
        sentFeedback?.content ??
        latestVersion?.teacherFeedback ??
        slot?.teacherFeedback ??
        "",
      finalMark,
    };
  });

  const maxTotalMarks = sortedCriteria.reduce(
    (total, criterion) => total + criterion.maxMarks,
    0,
  );
  const totalFinalMarks = rows.reduce(
    (sum, row) => sum + (row.finalMark?.teacherFinalMark ?? 0),
    0,
  );
  const missingMarks = rows.filter((row) => row.finalMark?.teacherFinalMark === undefined).length;
  const finalSubmittedCount = rows.filter((row) => row.slot?.status === "final_submitted").length;
  const latestSubmission = rows
    .map((row) => row.latestVersion?.submittedAt ?? row.slot?.submittedAt)
    .filter((submittedAt): submittedAt is Date => Boolean(submittedAt))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  const latestConsistencyRun = await prisma.consistencyCheck.findFirst({
    where: { classId, enrollmentId: enrollment.id },
    orderBy: { createdAt: "desc" },
    select: { runId: true, createdAt: true },
  });
  const consistencyChecks = latestConsistencyRun
    ? await prisma.consistencyCheck.findMany({
        where: { runId: latestConsistencyRun.runId },
        orderBy: { createdAt: "asc" },
        include: {
          sourceCriterion: { select: { code: true } },
          targetCriterion: { select: { code: true } },
          requestedBy: { select: { name: true, email: true } },
        },
      })
    : [];

  const slotIds = enrollment.submissionSlots.map((slot) => slot.id);
  const auditLogs = await prisma.auditLog.findMany({
    where:
      slotIds.length > 0
        ? {
            OR: [
              { entityType: "enrollment", entityId: enrollment.id },
              { entityType: "submission_slot", entityId: { in: slotIds } },
            ],
          }
        : { entityType: "enrollment", entityId: enrollment.id },
    orderBy: { createdAt: "desc" },
    take: 12,
    include: {
      actor: { select: { name: true, email: true, role: true } },
    },
  });
  const latestExportLog = await prisma.auditLog.findFirst({
    where: {
      entityType: "enrollment",
      entityId: enrollment.id,
      action: "export.package_downloaded",
    },
    orderBy: { createdAt: "desc" },
    include: {
      actor: { select: { name: true, email: true, role: true } },
    },
  });
  const readiness = buildReportReadiness({
    rows,
    hasConsistencyReview: consistencyChecks.length > 0,
    consistencyIssueCount: consistencyChecks.filter((check) => check.status !== "met").length,
    hasAuditEvents: auditLogs.length > 0,
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-10 print:max-w-none print:px-0 print:py-0">
      <section className="flex flex-col gap-4 border-b pb-6 print:border-b-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="print:hidden">
              <Button asChild variant="ghost" size="sm" className="-ml-3 mb-3">
                <Link href={`/teacher/classes/${enrollment.class.id}/students/${enrollment.id}`}>
                  Back to student
                </Link>
              </Button>
            </div>
            <p className="text-sm font-medium text-muted-foreground">IA Supervisor report</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">
              {enrollment.student.name}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {enrollment.student.email} · {enrollment.class.name} ·{" "}
              {enrollment.class.subject.name}
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <PrintReportButton />
            <Button asChild>
              <Link href={`/teacher/classes/${enrollment.class.id}/analytics`}>
                Class marks
              </Link>
            </Button>
          </div>
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-5">
          <ReportMetric label="Exam session" value={enrollment.class.examSession} />
          <ReportMetric
            label="Package readiness"
            value={readiness.isReady ? "Ready" : "Not ready"}
          />
          <ReportMetric
            label="Final marks"
            value={
              missingMarks === 0
                ? `${totalFinalMarks}/${maxTotalMarks}`
                : `${totalFinalMarks}+/${maxTotalMarks}`
            }
          />
          <ReportMetric label="Final submitted" value={`${finalSubmittedCount}/${rows.length}`} />
          <ReportMetric
            label="Latest submission"
            value={latestSubmission ? latestSubmission.toLocaleDateString() : "None"}
          />
        </div>
      </section>

      <Card
        className={
          readiness.isReady
            ? "border-emerald-200 bg-emerald-50/40"
            : "border-amber-200 bg-amber-50/40"
        }
      >
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-lg">Final Package Readiness</CardTitle>
              <CardDescription>
                Checks whether this student&apos;s IA record is ready for final export preparation.
              </CardDescription>
            </div>
            <span
              className={`inline-flex rounded-md border px-3 py-2 text-sm font-semibold ${
                readiness.isReady
                  ? "border-emerald-200 bg-emerald-100 text-emerald-900"
                  : "border-amber-200 bg-amber-100 text-amber-900"
              }`}
            >
              {readiness.isReady ? "Ready" : "Not ready"}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {readiness.blockingIssues.length > 0 ? (
            <div className="grid gap-2">
              <p className="text-sm font-medium">Blocking issues</p>
              {readiness.blockingIssues.map((issue) => (
                <ReadinessIssueRow key={`${issue.label}-${issue.detail}`} issue={issue} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-emerald-900">
              All required criterion files, final-submitted states, sent feedback, and final marks are present.
            </p>
          )}

          {readiness.warnings.length > 0 ? (
            <div className="mt-4 grid gap-2">
              <p className="text-sm font-medium">Warnings</p>
              {readiness.warnings.map((issue) => (
                <ReadinessIssueRow key={`${issue.label}-${issue.detail}`} issue={issue} />
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-lg">Export Package</CardTitle>
              <CardDescription>
                Download the current final package as a ZIP archive when readiness is complete.
              </CardDescription>
            </div>
            {readiness.isReady ? (
              <Button asChild>
                <a
                  href={`/api/teacher/classes/${enrollment.class.id}/students/${enrollment.id}/export`}
                >
                  Download ZIP
                </a>
              </Button>
            ) : (
              <Button type="button" disabled>
                Download ZIP
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            The ZIP includes the latest A-E files, report.html, report.json,
            manifest.json with SHA-256 checksums, audit-summary.json,
            feedback-summary.json, marks-summary.json, and consistency-summary.json.
          </p>
          {latestExportLog ? (
            <div className="mt-3 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <p className="font-medium">Latest export</p>
              <p className="mt-1 text-muted-foreground">
                {latestExportLog.createdAt.toLocaleString()} ·{" "}
                {latestExportLog.actor.name ?? latestExportLog.actor.email}
              </p>
              <p className="mt-1 text-muted-foreground">
                {formatExportMetadata(latestExportLog.metadata)}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No export package has been downloaded yet.
            </p>
          )}
          {!readiness.isReady ? (
            <p className="mt-2 text-sm text-amber-700">
              Resolve the blocking readiness issues before export is enabled.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Criterion Summary</CardTitle>
          <CardDescription>
            Status, latest files, sent feedback, and teacher final marks.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-3 py-2 font-medium">Criterion</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Latest version</th>
                  <th className="px-3 py-2 font-medium">Files</th>
                  <th className="px-3 py-2 font-medium">Final mark</th>
                  <th className="px-3 py-2 font-medium">Sent feedback</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.criterion.id} className="border-b align-top">
                    <td className="px-3 py-3">
                      <Link
                        href={`/teacher/classes/${enrollment.class.id}/students/${enrollment.id}/criteria/${row.criterion.id}`}
                        className="font-medium underline-offset-4 hover:underline print:no-underline"
                      >
                        Criterion {row.criterion.code}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.criterion.title} · /{row.criterion.maxMarks}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${getStatusTone(row.slot?.status ?? "not_started")}`}
                      >
                        {row.slot
                          ? formatSubmissionStatus(row.slot.status)
                          : "Not Started"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {row.latestVersion ? (
                        <>
                          v{row.latestVersion.versionNumber}
                          <br />
                          {row.latestVersion.submittedAt.toLocaleString()}
                        </>
                      ) : (
                        "None"
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {row.files.length > 0 ? (
                        <div className="grid gap-1">
                          {row.files.map((fileAsset) => (
                            <a
                              key={fileAsset.id}
                              href={`/api/files/${fileAsset.id}`}
                              className="max-w-[220px] truncate text-primary underline-offset-4 hover:underline print:text-foreground print:no-underline"
                            >
                              {fileAsset.originalName} · {formatFileSize(fileAsset.sizeBytes)}
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">No files</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {row.finalMark?.teacherFinalMark !== undefined &&
                      row.finalMark.teacherFinalMark !== null ? (
                        <div>
                          <p className="font-medium">
                            {row.finalMark.teacherFinalMark}/{row.criterion.maxMarks}
                          </p>
                          {row.finalMark.finalMarkedAt ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {row.finalMark.finalMarkedAt.toLocaleString()}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Missing</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {row.feedbackContent ? (
                        <div>
                          <p className="line-clamp-5 whitespace-pre-wrap text-muted-foreground print:line-clamp-none">
                            {row.feedbackContent}
                          </p>
                          {row.sentFeedback?.sentAt ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              Sent {row.sentFeedback.sentAt.toLocaleString()}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">No sent feedback</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cross-Criterion Consistency</CardTitle>
            <CardDescription>
              Latest consistency review for this student&apos;s IA evidence.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {consistencyChecks.length > 0 ? (
              <div className="grid gap-3">
                {consistencyChecks.map((check) => (
                  <div key={check.id} className="rounded-md border p-3 text-sm">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-medium">
                          {formatCriterionPair(
                            check.sourceCriterion?.code,
                            check.targetCriterion?.code,
                          )}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {formatCheckType(check.checkType)}
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${getConsistencyTone(check.status, check.severity)}`}
                      >
                        {formatConsistencyStatus(check.status)}
                      </span>
                    </div>
                    <p className="mt-3 text-muted-foreground">{check.summary}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No consistency review has been run for this student yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Audit Summary</CardTitle>
            <CardDescription>
              Recent workflow events related to this report.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {auditLogs.length > 0 ? (
              <div className="grid gap-3">
                {auditLogs.map((log) => (
                  <div key={log.id} className="rounded-md border p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">{formatAuditAction(log.action)}</p>
                      <p className="shrink-0 text-xs text-muted-foreground">
                        {log.createdAt.toLocaleDateString()}
                      </p>
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {log.actor.name ?? log.actor.email} · {formatSubmissionAuditState(log.fromState)}
                      {log.toState ? ` to ${formatSubmissionAuditState(log.toState)}` : ""}
                    </p>
                    {log.reason ? (
                      <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                        {log.reason}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No audit events have been recorded for this student yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="pb-4 text-xs text-muted-foreground">
        Generated {new Date().toLocaleString()} by {user.name ?? user.email}. This report summarizes
        IA Supervisor workflow records; teacher judgement remains final.
      </p>
    </main>
  );
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-base font-semibold">{value}</p>
    </div>
  );
}

function ReadinessIssueRow({ issue }: { issue: ReadinessIssue }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-sm">
      <p className="font-medium">{issue.label}</p>
      <p className="mt-1 text-muted-foreground">{issue.detail}</p>
    </div>
  );
}

function buildReportReadiness({
  rows,
  hasConsistencyReview,
  consistencyIssueCount,
  hasAuditEvents,
}: {
  rows: Array<{
    criterion: { code: string; title: string };
    slot?: { status: SubmissionStatus } | null;
    latestVersion?: unknown | null;
    files: unknown[];
    sentFeedback?: unknown | null;
    finalMark?: { teacherFinalMark: number | null } | null;
  }>;
  hasConsistencyReview: boolean;
  consistencyIssueCount: number;
  hasAuditEvents: boolean;
}) {
  const blockingIssues: ReadinessIssue[] = [];
  const warnings: ReadinessIssue[] = [];

  rows.forEach((row) => {
    const criterionLabel = `Criterion ${row.criterion.code}`;

    if (!row.slot) {
      blockingIssues.push({
        label: criterionLabel,
        detail: "Submission slot is missing.",
      });
      return;
    }

    if (row.slot.status !== "final_submitted") {
      blockingIssues.push({
        label: criterionLabel,
        detail: `Current status is ${formatSubmissionStatus(row.slot.status)}. Final export preparation expects Final Submitted.`,
      });
    }

    if (!row.latestVersion) {
      blockingIssues.push({
        label: criterionLabel,
        detail: "No submitted version is available.",
      });
    }

    if (row.files.length === 0) {
      blockingIssues.push({
        label: criterionLabel,
        detail: "No file is attached to the latest submitted version.",
      });
    }

    if (!row.sentFeedback) {
      blockingIssues.push({
        label: criterionLabel,
        detail: "No sent teacher feedback snapshot is available.",
      });
    }

    if (row.finalMark?.teacherFinalMark === undefined || row.finalMark.teacherFinalMark === null) {
      blockingIssues.push({
        label: criterionLabel,
        detail: "No teacher final mark has been saved.",
      });
    }
  });

  if (!hasConsistencyReview) {
    warnings.push({
      label: "Consistency review",
      detail: "No cross-criterion consistency review has been run for this student.",
    });
  } else if (consistencyIssueCount > 0) {
    warnings.push({
      label: "Consistency review",
      detail: `${consistencyIssueCount} consistency check result needs teacher attention.`,
    });
  }

  if (!hasAuditEvents) {
    warnings.push({
      label: "Audit trail",
      detail: "No recent audit events were found for this enrollment or its criterion slots.",
    });
  }

  return {
    isReady: blockingIssues.length === 0,
    blockingIssues,
    warnings,
  };
}

function getStatusTone(status: ReportStatus) {
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

function getConsistencyTone(
  status: ConsistencyCheckStatus,
  severity: ConsistencyCheckSeverity,
) {
  if (status === "met") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (severity === "critical" || status === "missing") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  if (severity === "warning" || status === "partial") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function formatConsistencyStatus(status: ConsistencyCheckStatus) {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCriterionPair(source?: string, target?: string) {
  if (source && target) {
    return `Criterion ${source} to Criterion ${target}`;
  }

  return "General consistency check";
}

function formatCheckType(checkType: string) {
  return checkType
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAuditAction(action: string) {
  return action
    .split(".")
    .map((part) =>
      part
        .split("_")
        .map((word) => word[0]?.toUpperCase() + word.slice(1))
        .join(" "),
    )
    .join(" · ");
}

function formatSubmissionAuditState(state: string | null) {
  if (!state) {
    return "recorded";
  }

  return state
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function formatExportMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "Package metadata not available.";
  }

  const record = metadata as Record<string, unknown>;
  const packageFileName =
    typeof record.packageFileName === "string"
      ? record.packageFileName
      : "export package";
  const fileCount =
    typeof record.fileCount === "number" ? `${record.fileCount} files` : null;
  const entryCount =
    typeof record.entryCount === "number" ? `${record.entryCount} entries` : null;
  const sizeLabel =
    typeof record.packageSizeBytes === "number"
      ? formatFileSize(record.packageSizeBytes)
      : null;
  const parts = [packageFileName, fileCount, entryCount, sizeLabel].filter(Boolean);

  return parts.join(" · ");
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
