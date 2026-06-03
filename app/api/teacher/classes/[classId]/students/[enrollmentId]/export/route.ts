import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { UserRole } from "@prisma/client";
import { NextResponse } from "next/server";

import { createAuditLog } from "@/lib/audit-log";
import { getCurrentUser } from "@/lib/current-user";
import { formatFileSize, sanitizeFileName } from "@/lib/files";
import { prisma } from "@/lib/prisma";
import { createZip } from "@/lib/zip";

export const dynamic = "force-dynamic";

type ExportEnrollment = {
  id: string;
  student: { name: string; email: string };
  class: {
    id: string;
    name: string;
    examSession: string;
    subject: { name: string };
    teacher: { name: string | null; email: string };
  };
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classId: string; enrollmentId: string }> },
) {
  const user = await getCurrentUser();
  const { classId, enrollmentId } = await params;

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  if (user.role !== "teacher") {
    return new NextResponse("Forbidden", { status: 403 });
  }

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
    return new NextResponse("Not found", { status: 404 });
  }

  const rows = enrollment.class.subject.criteria.map((criterion) => {
    const slot = enrollment.submissionSlots.find(
      (submissionSlot) => submissionSlot.criterionId === criterion.id,
    );
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
      finalMark,
    };
  });

  const blockingIssues = getBlockingIssues(rows);

  if (blockingIssues.length > 0) {
    return NextResponse.json(
      {
        error: "Final package is not ready for export.",
        blockingIssues,
      },
      { status: 409 },
    );
  }

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

  const fileEntries = await Promise.all(
    rows.flatMap((row) =>
      row.files.map(async (fileAsset, fileIndex) => {
        const data = await readFile(fileAsset.storagePath);

        return {
          path: `files/Criterion_${row.criterion.code}/${fileIndex + 1}-${sanitizeFileName(fileAsset.originalName)}`,
          data,
          modifiedAt: fileAsset.createdAt,
          criterionCode: row.criterion.code,
          originalName: fileAsset.originalName,
          sizeBytes: data.length,
          sha256: hashBuffer(data),
        };
      }),
    ),
  );
  const now = new Date();
  const exportBaseName = sanitizeFileName(
    `${enrollment.class.name}-${enrollment.student.name}-final-package`,
  );
  const packageFileName = `${exportBaseName}.zip`;

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
    take: 100,
    include: {
      actor: { select: { name: true, email: true, role: true } },
    },
  });

  const report = buildReport({
    enrollment,
    rows,
    consistencyChecks,
    auditLogs,
    generatedAt: now,
    generatedBy: user.name ?? user.email ?? "teacher",
  });
  const reportHtml = buildReportHtml(report);
  const reportJson = stringifyJson(report);
  const auditSummaryJson = stringifyJson(report.auditSummary);
  const feedbackSummaryJson = stringifyJson(report.feedbackSummary);
  const marksSummaryJson = stringifyJson(report.marksSummary);
  const consistencySummaryJson = stringifyJson(report.consistencySummary);
  const packageEntries = [
    ...fileEntries,
    {
      path: "report.html",
      data: reportHtml,
      modifiedAt: now,
    },
    {
      path: "report.json",
      data: reportJson,
      modifiedAt: now,
    },
    {
      path: "audit-summary.json",
      data: auditSummaryJson,
      modifiedAt: now,
    },
    {
      path: "feedback-summary.json",
      data: feedbackSummaryJson,
      modifiedAt: now,
    },
    {
      path: "marks-summary.json",
      data: marksSummaryJson,
      modifiedAt: now,
    },
    {
      path: "consistency-summary.json",
      data: consistencySummaryJson,
      modifiedAt: now,
    },
  ];
  const manifest = buildManifest({
    packageFileName,
    generatedAt: now,
    generatedBy: user.name ?? user.email ?? "teacher",
    fileCount: fileEntries.length,
    entries: packageEntries,
  });
  const zipBuffer = createZip([
    ...packageEntries,
    {
      path: "manifest.json",
      data: stringifyJson(manifest),
      modifiedAt: now,
    },
  ]);

  await createAuditLog({
    actorId: user.id,
    actorRole: user.role as UserRole,
    entityType: "enrollment",
    entityId: enrollment.id,
    action: "export.package_downloaded",
    toState: "package_downloaded",
    metadata: {
      classId,
      enrollmentId: enrollment.id,
      packageFileName,
      packageSizeBytes: zipBuffer.length,
      criteriaCount: rows.length,
      fileCount: fileEntries.length,
      entryCount: packageEntries.length + 1,
      manifestIncluded: true,
      generatedAt: now.toISOString(),
    },
  });

  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": zipBuffer.length.toString(),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(
        packageFileName,
      )}"`,
      "Cache-Control": "no-store",
    },
  });
}

function getBlockingIssues(
  rows: Array<{
    criterion: { code: string };
    slot?: { status: string } | null;
    latestVersion?: unknown | null;
    files: unknown[];
    sentFeedback?: unknown | null;
    finalMark?: { teacherFinalMark: number | null } | null;
  }>,
) {
  const issues: string[] = [];

  rows.forEach((row) => {
    const label = `Criterion ${row.criterion.code}`;

    if (!row.slot) {
      issues.push(`${label}: missing submission slot.`);
      return;
    }

    if (row.slot.status !== "final_submitted") {
      issues.push(
        `${label}: status is ${formatStatus(row.slot.status)}, not Final Submitted.`,
      );
    }

    if (!row.latestVersion) {
      issues.push(`${label}: no submitted version.`);
    }

    if (row.files.length === 0) {
      issues.push(`${label}: no latest file.`);
    }

    if (!row.sentFeedback) {
      issues.push(`${label}: no sent teacher feedback.`);
    }

    if (row.finalMark?.teacherFinalMark === undefined || row.finalMark.teacherFinalMark === null) {
      issues.push(`${label}: no teacher final mark.`);
    }
  });

  return issues;
}

function buildReport({
  enrollment,
  rows,
  consistencyChecks,
  auditLogs,
  generatedAt,
  generatedBy,
}: {
  enrollment: ExportEnrollment;
  rows: Array<{
    criterion: {
      code: string;
      title: string;
      maxMarks: number;
    };
    slot?: {
      status: string;
      submittedAt: Date | null;
    } | null;
    latestVersion?: {
      id: string;
      versionNumber: number;
      submittedAt: Date;
    } | null;
    files: Array<{
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      createdAt: Date;
    }>;
    sentFeedback?: {
      content: string;
      sentAt: Date | null;
      createdBy: { name: string | null; email: string };
    } | null;
    finalMark?: {
      teacherFinalMark: number | null;
      teacherFinalComment: string | null;
      finalMarkedAt: Date | null;
    } | null;
  }>;
  consistencyChecks: Array<{
    checkType: string;
    status: string;
    severity: string;
    summary: string;
    createdAt: Date;
    sourceCriterion: { code: string } | null;
    targetCriterion: { code: string } | null;
    requestedBy: { name: string | null; email: string };
  }>;
  auditLogs: Array<{
    action: string;
    fromState: string | null;
    toState: string | null;
    reason: string | null;
    createdAt: Date;
    actor: { name: string | null; email: string; role: string };
  }>;
  generatedAt: Date;
  generatedBy: string;
}) {
  const criteria = rows.map((row) => ({
    criterion: row.criterion.code,
    title: row.criterion.title,
    maxMarks: row.criterion.maxMarks,
    status: row.slot?.status ?? "not_started",
    latestVersion: row.latestVersion
      ? {
          id: row.latestVersion.id,
          versionNumber: row.latestVersion.versionNumber,
          submittedAt: row.latestVersion.submittedAt.toISOString(),
        }
      : null,
    files: row.files.map((fileAsset) => ({
      id: fileAsset.id,
      originalName: fileAsset.originalName,
      mimeType: fileAsset.mimeType,
      sizeBytes: fileAsset.sizeBytes,
      sizeLabel: formatFileSize(fileAsset.sizeBytes),
      createdAt: fileAsset.createdAt.toISOString(),
    })),
  }));
  const marksSummary = rows.map((row) => ({
    criterion: row.criterion.code,
    maxMarks: row.criterion.maxMarks,
    teacherFinalMark: row.finalMark?.teacherFinalMark ?? null,
    teacherFinalComment: row.finalMark?.teacherFinalComment ?? null,
    finalMarkedAt: row.finalMark?.finalMarkedAt?.toISOString() ?? null,
  }));

  return {
    generatedAt: generatedAt.toISOString(),
    generatedBy,
    student: {
      name: enrollment.student.name,
      email: enrollment.student.email,
    },
    class: {
      id: enrollment.class.id,
      name: enrollment.class.name,
      examSession: enrollment.class.examSession,
      subject: enrollment.class.subject.name,
      teacher: enrollment.class.teacher.name ?? enrollment.class.teacher.email,
    },
    criteria,
    marksSummary,
    totalMarks: {
      earned: marksSummary.reduce(
        (sum, mark) => sum + (mark.teacherFinalMark ?? 0),
        0,
      ),
      available: rows.reduce((sum, row) => sum + row.criterion.maxMarks, 0),
    },
    feedbackSummary: rows.map((row) => ({
      criterion: row.criterion.code,
      content: row.sentFeedback?.content ?? null,
      sentAt: row.sentFeedback?.sentAt?.toISOString() ?? null,
      sentBy:
        row.sentFeedback?.createdBy.name ??
        row.sentFeedback?.createdBy.email ??
        null,
    })),
    consistencySummary: consistencyChecks.map((check) => ({
      checkType: check.checkType,
      sourceCriterion: check.sourceCriterion?.code ?? null,
      targetCriterion: check.targetCriterion?.code ?? null,
      status: check.status,
      severity: check.severity,
      summary: check.summary,
      createdAt: check.createdAt.toISOString(),
      requestedBy: check.requestedBy.name ?? check.requestedBy.email,
    })),
    auditSummary: auditLogs.map((log) => ({
      action: log.action,
      fromState: log.fromState,
      toState: log.toState,
      reason: log.reason,
      createdAt: log.createdAt.toISOString(),
      actor: log.actor.name ?? log.actor.email,
      actorRole: log.actor.role,
    })),
  };
}

function buildReportHtml(report: ReturnType<typeof buildReport>) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(report.student.name)} IA Supervisor Final Package</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111827; line-height: 1.45; margin: 32px; }
    h1, h2 { margin-bottom: 8px; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0 28px; }
    th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
    .muted { color: #64748b; }
  </style>
</head>
<body>
  <h1>${escapeHtml(report.student.name)} Final IA Package</h1>
  <p class="muted">${escapeHtml(report.class.name)} · ${escapeHtml(report.class.subject)} · ${escapeHtml(report.class.examSession)}</p>
  <p>Generated ${escapeHtml(report.generatedAt)} by ${escapeHtml(report.generatedBy)}</p>
  <h2>Marks</h2>
  <p>Total: ${report.totalMarks.earned}/${report.totalMarks.available}</p>
  <table>
    <thead><tr><th>Criterion</th><th>Status</th><th>Files</th><th>Final mark</th><th>Feedback</th></tr></thead>
    <tbody>
      ${report.criteria
        .map((criterion) => {
          const mark = report.marksSummary.find(
            (item) => item.criterion === criterion.criterion,
          );
          const feedback = report.feedbackSummary.find(
            (item) => item.criterion === criterion.criterion,
          );

          return `<tr>
            <td>Criterion ${escapeHtml(criterion.criterion)}: ${escapeHtml(criterion.title)}</td>
            <td>${escapeHtml(formatStatus(criterion.status))}</td>
            <td>${criterion.files
              .map((file) => `${escapeHtml(file.originalName)} (${escapeHtml(file.sizeLabel)})`)
              .join("<br />")}</td>
            <td>${mark?.teacherFinalMark ?? ""}/${criterion.maxMarks}</td>
            <td>${escapeHtml(feedback?.content ?? "")}</td>
          </tr>`;
        })
        .join("")}
    </tbody>
  </table>
  <h2>Consistency Summary</h2>
  <table>
    <thead><tr><th>Check</th><th>Status</th><th>Severity</th><th>Summary</th></tr></thead>
    <tbody>
      ${report.consistencySummary
        .map(
          (check) => `<tr>
            <td>${escapeHtml(check.checkType)}</td>
            <td>${escapeHtml(check.status)}</td>
            <td>${escapeHtml(check.severity)}</td>
            <td>${escapeHtml(check.summary)}</td>
          </tr>`,
        )
        .join("")}
    </tbody>
  </table>
</body>
</html>`;
}

function stringifyJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function buildManifest({
  packageFileName,
  generatedAt,
  generatedBy,
  fileCount,
  entries,
}: {
  packageFileName: string;
  generatedAt: Date;
  generatedBy: string;
  fileCount: number;
  entries: Array<{
    path: string;
    data: Buffer | string;
    modifiedAt?: Date;
  }>;
}) {
  return {
    packageFileName,
    generatedAt: generatedAt.toISOString(),
    generatedBy,
    sourceFileCount: fileCount,
    entryCount: entries.length + 1,
    entries: [
      ...entries.map((entry) => {
        const data = Buffer.isBuffer(entry.data)
          ? entry.data
          : Buffer.from(entry.data, "utf8");

        return {
          path: entry.path,
          sizeBytes: data.length,
          sha256: hashBuffer(data),
          modifiedAt: entry.modifiedAt?.toISOString() ?? generatedAt.toISOString(),
        };
      }),
      {
        path: "manifest.json",
        sizeBytes: null,
        sha256: null,
        modifiedAt: generatedAt.toISOString(),
      },
    ],
  };
}

function hashBuffer(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
