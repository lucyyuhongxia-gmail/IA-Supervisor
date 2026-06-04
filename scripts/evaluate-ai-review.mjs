#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const allowedAlignmentStatuses = new Set([
  "met",
  "partial",
  "missing",
  "not_evidenced",
]);

const forbiddenClaimPatterns = [
  /could not be parsed/i,
  /could not be read/i,
  /couldn't be read/i,
  /no text was extracted/i,
  /no readable text/i,
  /file is unreadable/i,
  /pdf parsing error/i,
  /technical error/i,
];

const gradingPatterns = [
  /\b\d+\s*\/\s*\d+\b/,
  /\b(mark|score|grade)\s*[:=]\s*\d+/i,
  /\blevel\s+[1-7]\b/i,
  /\bgrade\s+[1-7]\b/i,
];

const genericFeedbackPatterns = [
  /^add more detail\.?$/i,
  /^be more specific\.?$/i,
  /^improve this section\.?$/i,
  /^expand this\.?$/i,
  /^good job\.?$/i,
];

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || (!args.file && !args.runId && !args.slotId)) {
    printHelp();
    return;
  }

  const review = args.file
    ? await loadReviewFromFile(args.file)
    : await loadReviewFromDatabase(args);
  const report = evaluateReview(review);

  printReport(report, review.sourceLabel);

  if (report.failures.length > 0 && !args.allowFail) {
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const args = {
    allowFail: false,
    help: false,
    file: "",
    runId: "",
    slotId: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--allow-fail":
        args.allowFail = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--file":
        args.file = argv[index + 1] ?? "";
        index += 1;
        break;
      case "--run-id":
        args.runId = argv[index + 1] ?? "";
        index += 1;
        break;
      case "--slot-id":
        args.slotId = argv[index + 1] ?? "";
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`AI Review Evaluation Harness

Usage:
  npm run ai-review:evaluate -- --run-id <aiReviewRunId>
  npm run ai-review:evaluate -- --slot-id <submissionSlotId>
  npm run ai-review:evaluate -- --file <review.json>

Options:
  --allow-fail  Print failures but exit with code 0.
  --help        Show this help.

The evaluator does not call an LLM. It checks stored or fixture AI review output for:
  - evidence-grounded concerns and suggestions
  - Issue / Why it matters / Revision guidance structure
  - 2027 syllabus alignment signals
  - forbidden extraction contradictions
  - accidental mark or grade predictions
  - generic feedback`);
}

async function loadReviewFromFile(filePath) {
  const value = JSON.parse(await readFile(filePath, "utf8"));

  return normalizeReviewInput(value, `file:${filePath}`);
}

async function loadReviewFromDatabase(args) {
  const prisma = new PrismaClient();

  try {
    const run = args.runId
      ? await prisma.aIReviewRun.findUnique({
          where: { id: args.runId },
          include: { findings: { orderBy: { sortOrder: "asc" } } },
        })
      : await prisma.aIReviewRun.findFirst({
          where: { submissionSlotId: args.slotId },
          orderBy: { createdAt: "desc" },
          include: { findings: { orderBy: { sortOrder: "asc" } } },
        });

    if (!run) {
      throw new Error("AI review run not found.");
    }

    return normalizeReviewInput(
      {
        id: run.id,
        status: run.status,
        summary: run.summary,
        confidence: run.confidence,
        rawResponse: run.rawResponse,
        findings: run.findings.map((finding) => ({
          type: finding.type,
          text: finding.text,
        })),
      },
      `database:${run.id}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

function normalizeReviewInput(value, sourceLabel) {
  const record = isRecord(value) ? value : {};
  const findings = Array.isArray(record.findings)
    ? record.findings
        .filter(isRecord)
        .map((finding) => ({
          type: stringField(finding.type),
          text: stringField(finding.text),
        }))
    : [
        ...normalizeFindingArray(record.strengths, "strength"),
        ...normalizeFindingArray(record.concerns, "concern"),
        ...normalizeFindingArray(record.suggestions, "suggestion"),
      ];

  const rawResponse = isRecord(record.rawResponse) ? record.rawResponse : record;
  const studentFeedbackDraft =
    stringField(record.studentFeedbackDraft) ||
    stringField(rawResponse.studentFeedbackDraft);
  const rubricAlignment =
    Array.isArray(record.rubricAlignment)
      ? record.rubricAlignment
      : Array.isArray(rawResponse.rubricAlignment)
        ? rawResponse.rubricAlignment
        : [];

  return {
    sourceLabel,
    id: stringField(record.id),
    status: stringField(record.status),
    summary: stringField(record.summary),
    confidence: stringField(record.confidence),
    findings,
    rubricAlignment,
    studentFeedbackDraft,
    rawResponse,
  };
}

function normalizeFindingArray(value, type) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => ({
    type,
    text:
      typeof item === "string"
        ? item.trim()
        : isRecord(item)
          ? JSON.stringify(item)
          : "",
  }));
}

function evaluateReview(review) {
  const checks = [];
  const allText = [
    review.summary,
    ...review.findings.map((finding) => finding.text),
    JSON.stringify(review.rawResponse),
  ].join("\n");
  const concerns = review.findings.filter((finding) => finding.type === "concern");
  const suggestions = review.findings.filter(
    (finding) => finding.type === "suggestion",
  );

  addCheck(checks, {
    name: "Completed review",
    pass: review.status === "" || review.status === "completed",
    severity: "fail",
    detail: review.status
      ? `status=${review.status}`
      : "Fixture has no status; treated as completed.",
  });

  addCheck(checks, {
    name: "Summary present",
    pass: review.summary.trim().length >= 40,
    severity: "fail",
    detail: `${review.summary.trim().length} characters`,
  });

  addCheck(checks, {
    name: "Concerns or suggestions present",
    pass: concerns.length + suggestions.length > 0,
    severity: "fail",
    detail: `${concerns.length} concerns, ${suggestions.length} suggestions`,
  });

  concerns.forEach((finding, index) => {
    addStructuredConcernChecks(checks, finding.text, index + 1);
  });

  suggestions.forEach((finding, index) => {
    addStructuredSuggestionChecks(checks, finding.text, index + 1);
  });

  addCheck(checks, {
    name: "2027 syllabus alignment signal",
    pass:
      /2027/i.test(allText) ||
      /IB Computer Science IA 2027/i.test(
        JSON.stringify(review.rawResponse?.qualityControls ?? {}),
      ),
    severity: "warn",
    detail: "Expect explicit 2027 syllabus or assessment standard reference.",
  });

  addCheck(checks, {
    name: "No forbidden extraction contradiction",
    pass: !forbiddenClaimPatterns.some((pattern) => pattern.test(allText)),
    severity: "fail",
    detail:
      "Should not claim unreadable/no extracted text when server extraction succeeded.",
  });

  addCheck(checks, {
    name: "No mark or grade prediction",
    pass: !gradingPatterns.some((pattern) => pattern.test(allText)),
    severity: "fail",
    detail: "AI review must not assign marks, scores, grades, or levels.",
  });

  addCheck(checks, {
    name: "Rubric alignment present",
    pass: review.rubricAlignment.length > 0,
    severity: "warn",
    detail: `${review.rubricAlignment.length} rubric alignment items`,
  });

  review.rubricAlignment.forEach((item, index) => {
    addRubricAlignmentChecks(checks, item, index + 1);
  });

  const genericFindings = review.findings.filter((finding) =>
    genericFeedbackPatterns.some((pattern) => pattern.test(finding.text.trim())),
  );

  addCheck(checks, {
    name: "No generic one-line feedback",
    pass: genericFindings.length === 0,
    severity: "warn",
    detail:
      genericFindings.length === 0
        ? "No generic feedback patterns found."
        : `${genericFindings.length} generic findings found.`,
  });

  addStudentFeedbackDraftChecks(checks, review.studentFeedbackDraft);

  return {
    checks,
    failures: checks.filter((check) => check.severity === "fail" && !check.pass),
    warnings: checks.filter((check) => check.severity === "warn" && !check.pass),
  };
}

function addStudentFeedbackDraftChecks(checks, draft) {
  if (!draft) {
    addCheck(checks, {
      name: "Student feedback draft present",
      pass: false,
      severity: "warn",
      detail: "Expected studentFeedbackDraft for teacher copy-to-feedback workflow.",
    });
    return;
  }

  addCheck(checks, {
    name: "Student feedback draft uses Markdown headings",
    pass:
      /##\s+Summary/i.test(draft) &&
      /##\s+What is working/i.test(draft) &&
      /##\s+What to revise/i.test(draft) &&
      /##\s+Next actions/i.test(draft),
    severity: "warn",
    detail: "Expected Summary, What is working, What to revise, and Next actions headings.",
  });

  addCheck(checks, {
    name: "Student feedback draft cites evidence",
    pass: hasEvidenceSignal(draft),
    severity: "warn",
    detail: truncate(draft, 160),
  });

  addCheck(checks, {
    name: "Student feedback draft explains importance",
    pass: hasLabelSignal(draft, "Why it matters"),
    severity: "warn",
    detail: "Expected Why it matters in revision bullets.",
  });

  addCheck(checks, {
    name: "Student feedback draft includes actions",
    pass: hasLabelSignal(draft, "Action"),
    severity: "warn",
    detail: "Expected Action in revision bullets.",
  });
}

function addStructuredConcernChecks(checks, text, index) {
  addCheck(checks, {
    name: `Concern ${index}: evidence cited`,
    pass: hasEvidenceSignal(text),
    severity: "fail",
    detail: truncate(text, 140),
  });

  addCheck(checks, {
    name: `Concern ${index}: issue stated`,
    pass: hasLabelSignal(text, "Issue"),
    severity: "fail",
    detail: "Expect Issue: ...",
  });

  addCheck(checks, {
    name: `Concern ${index}: why it matters stated`,
    pass: hasLabelSignal(text, "Why it matters"),
    severity: "fail",
    detail: "Expect Why it matters: ...",
  });

  addCheck(checks, {
    name: `Concern ${index}: revision guidance stated`,
    pass: hasLabelSignal(text, "Revision guidance"),
    severity: "fail",
    detail: "Expect Revision guidance: ...",
  });
}

function addStructuredSuggestionChecks(checks, text, index) {
  addCheck(checks, {
    name: `Suggestion ${index}: evidence cited`,
    pass: hasEvidenceSignal(text),
    severity: "warn",
    detail: truncate(text, 140),
  });

  addCheck(checks, {
    name: `Suggestion ${index}: action stated`,
    pass: /Revision action:|Revision guidance:|Suggested next step:/i.test(text),
    severity: "fail",
    detail: "Expect actionable revision text.",
  });

  addCheck(checks, {
    name: `Suggestion ${index}: expected improvement stated`,
    pass: /Expected improvement:|Why it matters:/i.test(text),
    severity: "warn",
    detail: "Expect criterion-alignment benefit.",
  });
}

function addRubricAlignmentChecks(checks, item, index) {
  if (!isRecord(item)) {
    addCheck(checks, {
      name: `Rubric alignment ${index}: valid object`,
      pass: false,
      severity: "warn",
      detail: "Item is not an object.",
    });
    return;
  }

  addCheck(checks, {
    name: `Rubric alignment ${index}: check present`,
    pass: Boolean(stringField(item.check)),
    severity: "warn",
    detail: stringField(item.check) || "missing check",
  });

  addCheck(checks, {
    name: `Rubric alignment ${index}: status valid`,
    pass: allowedAlignmentStatuses.has(stringField(item.status)),
    severity: "warn",
    detail: stringField(item.status) || "missing status",
  });

  addCheck(checks, {
    name: `Rubric alignment ${index}: evidence present`,
    pass: Boolean(stringField(item.evidence)),
    severity: "warn",
    detail: truncate(stringField(item.evidence) || "missing evidence", 120),
  });
}

function hasEvidenceSignal(text) {
  return hasLabelSignal(text, "Evidence") || /Evidence file:/i.test(text);
}

function hasLabelSignal(text, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:\\*\\*)?${escapedLabel}(?:\\*\\*)?:`, "i").test(text);
}

function addCheck(checks, check) {
  checks.push(check);
}

function printReport(report, sourceLabel) {
  const passed = report.checks.filter((check) => check.pass).length;
  const total = report.checks.length;

  console.log(`AI Review Quality Report: ${sourceLabel}`);
  console.log(`Result: ${passed}/${total} checks passed`);
  console.log(`Failures: ${report.failures.length}`);
  console.log(`Warnings: ${report.warnings.length}`);
  console.log("");

  report.checks.forEach((check) => {
    const status = check.pass ? "PASS" : check.severity.toUpperCase();
    console.log(`[${status}] ${check.name}`);
    console.log(`  ${check.detail}`);
  });
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value) {
  return typeof value === "string" ? value.trim() : "";
}

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength).trim()}...` : value;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
