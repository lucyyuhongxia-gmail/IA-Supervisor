#!/usr/bin/env tsx

import "dotenv/config";

import type { SubmissionStatus, UserRole } from "@prisma/client";

import { runAIReviewForSlot } from "@/lib/ai-review";
import { extractFileText } from "@/lib/file-extraction";
import { prisma } from "@/lib/prisma";
import { generateSemanticExtractionForSlot } from "@/lib/semantic-extraction";
import {
  checkAIReviewProvider,
  formatProviderCheckResult,
  getAIReviewProviderCheckConfig,
} from "./lib/ai-provider-check";

const defaultClassName = "IB CS IA 2027 Official Examples";
const officialStudentEmailPattern = /^official-example-(\d+)@student\.test$/;
const runnableStatuses = new Set<SubmissionStatus>([
  "submitted",
  "under_review",
  "revision_needed",
  "passed",
]);

type Args = {
  allowFail: boolean;
  className: string;
  criterionCodes: Set<string> | null;
  dryRun: boolean;
  force: boolean;
  help: boolean;
  limit: number | null;
  providerCheckTimeoutMs: number;
  skipProviderCheck: boolean;
  studentEmails: Set<string> | null;
};

type RunOutcome =
  | "would_run"
  | "skipped_current"
  | "skipped_limit"
  | "completed"
  | "blocked"
  | "failed";

type RowResult = {
  studentEmail: string;
  criterionCode: string;
  slotId: string;
  versionId: string | null;
  latestAIReviewRunId: string | null;
  outcome: RunOutcome;
  message: string;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  assertLocalDatabase();

  if (!args.dryRun && !args.skipProviderCheck) {
    console.log("Checking AI review provider before batch run...");

    const providerCheck = await checkAIReviewProvider({
      config: getAIReviewProviderCheckConfig(),
      timeoutMs: args.providerCheckTimeoutMs,
    });
    const providerCheckOutput = formatProviderCheckResult(providerCheck);

    if (!providerCheck.ok) {
      throw new Error(
        `${providerCheckOutput}\nProvider preflight failed. Fix .env or rerun with --skip-provider-check only for deliberate local testing.`,
      );
    }

    console.log(providerCheckOutput);
  }

  const classRecord = await prisma.class.findFirst({
    where: { name: args.className },
    select: {
      id: true,
      name: true,
      teacherId: true,
      teacher: { select: { email: true, name: true } },
    },
  });

  if (!classRecord) {
    throw new Error(
      `Class not found: ${args.className}. Run npm run demo:official-examples first.`,
    );
  }

  const slots = await loadOfficialSlots({
    classId: classRecord.id,
    criterionCodes: args.criterionCodes,
    studentEmails: args.studentEmails,
  });
  const results: RowResult[] = [];
  let runCount = 0;

  for (const slot of slots) {
    const latestRun = slot.aiReviewRuns[0] ?? null;
    const latestVersionId = slot.latestVersionId;
    const rowBase = {
      studentEmail: slot.enrollment.student.email,
      criterionCode: slot.criterion.code,
      slotId: slot.id,
      versionId: latestVersionId,
      latestAIReviewRunId: latestRun?.id ?? null,
    };

    if (!args.force && latestRun?.status === "completed" && latestRun.submissionVersionId === latestVersionId) {
      results.push({
        ...rowBase,
        outcome: "skipped_current",
        message: "AI review already covers the latest submitted version.",
      });
      continue;
    }

    const blockedReason = await getBlockedReason(slot);

    if (blockedReason) {
      results.push({
        ...rowBase,
        outcome: "blocked",
        message: blockedReason,
      });
      continue;
    }

    if (args.limit !== null && runCount >= args.limit) {
      results.push({
        ...rowBase,
        outcome: "skipped_limit",
        message: `Limit ${args.limit} reached.`,
      });
      continue;
    }

    if (args.dryRun) {
      runCount += 1;
      results.push({
        ...rowBase,
        outcome: "would_run",
        message: "Dry run: AI review would be generated.",
      });
      continue;
    }

    runCount += 1;
    console.log(
      `Running AI review: ${slot.enrollment.student.email} Criterion ${slot.criterion.code}`,
    );

    await generateSemanticExtractionForSlot({
      slotId: slot.id,
      actorId: classRecord.teacherId,
      actorRole: "teacher" as UserRole,
      classId: classRecord.id,
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.warn(
        `Semantic extraction warning for ${slot.enrollment.student.email} Criterion ${slot.criterion.code}: ${message}`,
      );
    });

    const result = await runAIReviewForSlot({
      classId: classRecord.id,
      slotId: slot.id,
      requestedById: classRecord.teacherId,
    });

    if ("error" in result && result.error) {
      results.push({
        ...rowBase,
        outcome: "failed",
        message: result.error,
      });
      continue;
    }

    results.push({
      ...rowBase,
      outcome: "completed",
      message: "AI review completed.",
    });
  }

  printSummary({
    className: classRecord.name,
    teacherEmail: classRecord.teacher.email,
    provider: getProviderLabel(),
    dryRun: args.dryRun,
    results,
  });

  const hasFailures = results.some(
    (result) => result.outcome === "blocked" || result.outcome === "failed",
  );

  if (hasFailures && !args.allowFail) {
    process.exitCode = 1;
  }
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    allowFail: false,
    className: defaultClassName,
    criterionCodes: null,
    dryRun: false,
    force: false,
    help: false,
    limit: null,
    providerCheckTimeoutMs: 15000,
    skipProviderCheck: false,
    studentEmails: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--allow-fail":
        args.allowFail = true;
        break;
      case "--class-name":
        args.className = requireValue(argv, index, arg);
        index += 1;
        break;
      case "--criterion":
        args.criterionCodes = new Set(
          requireValue(argv, index, arg)
            .split(",")
            .map((value) => value.trim().toUpperCase())
            .filter(Boolean),
        );
        index += 1;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--force":
        args.force = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--limit": {
        const value = Number(requireValue(argv, index, arg));

        if (!Number.isInteger(value) || value < 1) {
          throw new Error("--limit must be a positive integer.");
        }

        args.limit = value;
        index += 1;
        break;
      }
      case "--provider-check-timeout-ms": {
        const value = Number(requireValue(argv, index, arg));

        if (!Number.isInteger(value) || value < 1000) {
          throw new Error("--provider-check-timeout-ms must be an integer >= 1000.");
        }

        args.providerCheckTimeoutMs = value;
        index += 1;
        break;
      }
      case "--skip-provider-check":
        args.skipProviderCheck = true;
        break;
      case "--student":
        args.studentEmails = new Set(
          requireValue(argv, index, arg)
            .split(",")
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean),
        );
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function requireValue(argv: string[], index: number, flag: string) {
  const value = argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function printHelp() {
  console.log(`Run official IA example AI reviews

Usage:
  npm run ai-review:run-official -- --dry-run
  npm run ai-review:run-official -- --limit 5
  npm run ai-review:run-official -- --criterion A,B
  npm run ai-review:run-official -- --student official-example-1@student.test
  npm run ai-review:run-official -- --force --limit 1

Options:
  --dry-run       Check which reviews would run without calling the AI provider.
  --limit <n>     Run at most n missing/stale reviews.
  --force         Rerun even when a completed AI review already covers the latest version.
  --criterion     Comma-separated criterion codes, for example A,B,D.
  --student       Comma-separated official student emails.
  --skip-provider-check
                  Skip the real-provider preflight in write mode.
  --allow-fail    Print blocked/failed rows but exit with code 0.

The command reuses the production AI review service and writes normal AI review
runs to the database. It defaults to the configured provider:
AI_REVIEW_PROVIDER=deepseek when DEEPSEEK_API_KEY is present, otherwise mock.
In write mode, the command checks the configured provider before creating any
AIReviewRun records unless --skip-provider-check is provided.`);
}

function assertLocalDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const parsed = new URL(databaseUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

  if (!localHosts.has(parsed.hostname)) {
    throw new Error(`Refusing to run official AI reviews on non-local database host: ${parsed.hostname}`);
  }
}

async function loadOfficialSlots({
  classId,
  criterionCodes,
  studentEmails,
}: {
  classId: string;
  criterionCodes: Set<string> | null;
  studentEmails: Set<string> | null;
}) {
  const slots = await prisma.submissionSlot.findMany({
    where: {
      enrollment: {
        classId,
        student: {
          email: {
            endsWith: "@student.test",
          },
        },
      },
    },
    include: {
      criterion: { select: { code: true, title: true } },
      enrollment: {
        select: {
          student: { select: { email: true, name: true } },
        },
      },
      latestVersion: {
        select: {
          id: true,
          fileAssets: { orderBy: { createdAt: "desc" } },
        },
      },
      aiReviewRuns: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          submissionVersionId: true,
        },
      },
    },
    orderBy: [
      { enrollment: { student: { email: "asc" } } },
      { criterion: { sortOrder: "asc" } },
    ],
  });

  return slots.filter((slot) => {
    const studentEmail = slot.enrollment.student.email.toLowerCase();

    return (
      officialStudentEmailPattern.test(studentEmail) &&
      (!criterionCodes || criterionCodes.has(slot.criterion.code.toUpperCase())) &&
      (!studentEmails || studentEmails.has(studentEmail))
    );
  });
}

async function getBlockedReason(
  slot: Awaited<ReturnType<typeof loadOfficialSlots>>[number],
) {
  if (!runnableStatuses.has(slot.status)) {
    return `Status ${slot.status} is not runnable.`;
  }

  if (!slot.latestVersionId || !slot.latestVersion) {
    return "A submitted version is required before AI review can run.";
  }

  const pdfFiles = slot.latestVersion.fileAssets.filter(isPdfFileAsset);

  if (pdfFiles.length === 0) {
    return "A submitted PDF file is required before AI review can run.";
  }

  const extractionChecks = await Promise.all(
    pdfFiles.map((fileAsset) => extractFileText(fileAsset)),
  );
  const hasReadableText = extractionChecks.some(
    (extraction) =>
      extraction.status === "success" && extraction.characterCount >= 120,
  );

  if (!hasReadableText) {
    return "Latest PDF does not contain enough readable text.";
  }

  return null;
}

function isPdfFileAsset(fileAsset: { mimeType: string; originalName: string }) {
  return (
    fileAsset.mimeType === "application/pdf" ||
    fileAsset.originalName.toLowerCase().endsWith(".pdf")
  );
}

function getProviderLabel() {
  const provider =
    process.env.AI_REVIEW_PROVIDER?.trim().toLowerCase() ||
    (process.env.DEEPSEEK_API_KEY ? "deepseek" : "mock");
  const model =
    provider === "deepseek"
      ? process.env.DEEPSEEK_MODEL || "deepseek-v4-flash"
      : "mock-ai-review";

  return `${provider}:${model}`;
}

function printSummary({
  className,
  teacherEmail,
  provider,
  dryRun,
  results,
}: {
  className: string;
  teacherEmail: string;
  provider: string;
  dryRun: boolean;
  results: RowResult[];
}) {
  const counts = results.reduce<Record<RunOutcome, number>>(
    (accumulator, result) => {
      accumulator[result.outcome] += 1;
      return accumulator;
    },
    {
      blocked: 0,
      completed: 0,
      failed: 0,
      skipped_current: 0,
      skipped_limit: 0,
      would_run: 0,
    },
  );

  console.log("");
  console.log("Official AI review batch complete.");
  console.log(`Class: ${className}`);
  console.log(`Teacher: ${teacherEmail}`);
  console.log(`Provider: ${provider}`);
  console.log(`Mode: ${dryRun ? "dry-run" : "write"}`);
  console.log(`Total slots: ${results.length}`);
  console.log(`Completed: ${counts.completed}`);
  console.log(`Would run: ${counts.would_run}`);
  console.log(`Skipped current: ${counts.skipped_current}`);
  console.log(`Skipped by limit: ${counts.skipped_limit}`);
  console.log(`Blocked: ${counts.blocked}`);
  console.log(`Failed: ${counts.failed}`);

  const notableRows = results.filter(
    (result) =>
      result.outcome === "blocked" ||
      result.outcome === "failed" ||
      result.outcome === "would_run" ||
      result.outcome === "completed",
  );

  if (notableRows.length > 0) {
    console.log("");
    console.log("Rows:");

    for (const result of notableRows) {
      console.log(
        `- ${result.studentEmail} Criterion ${result.criterionCode}: ${result.outcome} - ${result.message}`,
      );
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
