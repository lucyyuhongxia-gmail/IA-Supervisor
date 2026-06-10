#!/usr/bin/env node

import "dotenv/config";

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const exampleRoot = path.resolve("docs/test/IA-example for 2027");
const defaultClassName = "IB CS IA 2027 Official Examples";
const defaultOutputDir = path.resolve("tmp/ai-review-benchmark");
const expectedExampleCount = 8;
const criterionCodes = ["A", "B", "C", "D", "E"];
const stopWords = new Set([
  "about",
  "achieve",
  "achieves",
  "against",
  "also",
  "and",
  "are",
  "assessment",
  "available",
  "awarded",
  "because",
  "been",
  "but",
  "can",
  "clear",
  "clearly",
  "comment",
  "comments",
  "computer",
  "criterion",
  "criteria",
  "descriptor",
  "does",
  "enough",
  "example",
  "expected",
  "for",
  "from",
  "has",
  "have",
  "includes",
  "into",
  "internal",
  "more",
  "not",
  "section",
  "somewhat",
  "strand",
  "student",
  "subject",
  "that",
  "the",
  "there",
  "this",
  "well",
  "which",
  "with",
  "work",
]);

const criterionFocusTerms = {
  A: [
    "problem scenario",
    "measurable requirements",
    "success criteria",
    "computational context",
  ],
  B: ["decomposition", "plan", "chronology", "success criteria"],
  C: ["system model", "algorithms", "testing strategy", "file interactions"],
  D: ["functionality", "techniques", "evaluation", "justification", "testing"],
  E: ["evaluation", "success criteria", "improvements", "depth", "detail"],
};

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  assertExampleRoot();

  const examples = await discoverExamples();
  const classRecord = await loadOfficialClass(args.className);
  const benchmarkRows = [];
  const examinerCache = new Map();

  for (const example of examples) {
    const examinerText = await readExaminerText(example, examinerCache);

    for (const code of criterionCodes) {
      benchmarkRows.push(
        await buildBenchmarkRow({
          example,
          code,
          examinerText,
          classId: classRecord.id,
        }),
      );
    }
  }

  const report = buildReport({
    classRecord,
    rows: benchmarkRows,
    examples,
  });

  await writeReports({
    report,
    outputDir: args.outputDir,
  });

  printSummary(report, args.outputDir);

  const hasMissing = report.summary.missingReviews > 0;
  const hasFailedRuns = report.summary.failedReviews > 0;
  const hasQualityFailures = report.rows.some((row) =>
    row.checks.some((check) => check.severity === "fail" && !check.pass),
  );

  if ((hasMissing && !args.allowMissing) || hasFailedRuns || hasQualityFailures) {
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const args = {
    allowMissing: false,
    className: defaultClassName,
    help: false,
    outputDir: defaultOutputDir,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--allow-missing":
        args.allowMissing = true;
        break;
      case "--class-name":
        args.className = argv[index + 1] ?? "";
        index += 1;
        break;
      case "--output-dir":
        args.outputDir = path.resolve(argv[index + 1] ?? defaultOutputDir);
        index += 1;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Official IA Example AI Review Benchmark

Usage:
  npm run ai-review:benchmark-official
  npm run ai-review:benchmark-official -- --allow-missing
  npm run ai-review:benchmark-official -- --output-dir tmp/ai-review-benchmark

What it checks:
  - 8 official IA examples x 5 criteria = 40 expected AI reviews
  - examiner-comment PDF extraction
  - criterion-specific overlap between AI review and official examiner comments
  - evidence-grounded feedback structure
  - studentFeedbackDraft Markdown format
  - no mark or grade prediction

Default behavior fails when expected AI reviews are missing. Use --allow-missing
while preparing or smoke-testing the official example dataset.`);
}

function assertExampleRoot() {
  if (!existsSync(exampleRoot)) {
    throw new Error(
      `Official example directory not found: ${exampleRoot}. Run npm run demo:official-examples after adding the official files.`,
    );
  }
}

async function discoverExamples() {
  const entries = await readdir(exampleRoot, { withFileTypes: true });
  const examples = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const numberMatch = entry.name.match(/(\d+)/);

    if (!numberMatch) {
      continue;
    }

    const number = Number(numberMatch[1]);
    const directory = path.join(exampleRoot, entry.name);
    const examinerCommentPdf = path.join(
      directory,
      `DP_Comp_sci_asw_examiner_comment_example_${number}_en.pdf`,
    );

    if (!existsSync(examinerCommentPdf)) {
      throw new Error(`Missing examiner comment PDF: ${examinerCommentPdf}`);
    }

    examples.push({
      number,
      directory,
      examinerCommentPdf,
      studentEmail: `official-example-${number}@student.test`,
    });
  }

  examples.sort((left, right) => left.number - right.number);

  if (examples.length !== expectedExampleCount) {
    throw new Error(
      `Expected ${expectedExampleCount} official examples, found ${examples.length}.`,
    );
  }

  return examples;
}

async function loadOfficialClass(className) {
  const classRecord = await prisma.class.findFirst({
    where: { name: className },
    select: {
      id: true,
      name: true,
      inviteCode: true,
      teacher: { select: { email: true, name: true } },
    },
  });

  if (!classRecord) {
    throw new Error(
      `Class not found: ${className}. Run npm run demo:official-examples first.`,
    );
  }

  return classRecord;
}

async function readExaminerText(example, cache) {
  if (cache.has(example.examinerCommentPdf)) {
    return cache.get(example.examinerCommentPdf);
  }

  const text = await extractPdfText(example.examinerCommentPdf);
  cache.set(example.examinerCommentPdf, text);

  return text;
}

async function extractPdfText(filePath) {
  const { PDFParse } = await import("pdf-parse");

  PDFParse.setWorker(
    pathToFileURL(
      path.join(
        process.cwd(),
        "node_modules",
        "pdfjs-dist",
        "legacy",
        "build",
        "pdf.worker.mjs",
      ),
    ).href,
  );

  const parser = new PDFParse({ data: new Uint8Array(await readFile(filePath)) });

  try {
    const result = await parser.getText();

    return cleanText(result.text);
  } finally {
    await parser.destroy();
  }
}

async function buildBenchmarkRow({ example, code, examinerText, classId }) {
  const officialComment = extractCriterionComment(examinerText, code);
  const slot = await loadSubmissionSlot({
    classId,
    studentEmail: example.studentEmail,
    criterionCode: code,
  });
  const latestRun = slot?.aiReviewRuns[0] ?? null;

  if (!slot) {
    return {
      exampleNumber: example.number,
      criterionCode: code,
      studentEmail: example.studentEmail,
      status: "missing_slot",
      score: 0,
      maxScore: 0,
      officialComment,
      officialFocusTerms: getPresentFocusTerms(code, officialComment),
      matchedFocusTerms: [],
      keywordOverlap: [],
      aiReviewRunId: null,
      checks: [
        {
          name: "Submission slot exists",
          pass: false,
          severity: "fail",
          detail: "Seeded official example slot was not found.",
        },
      ],
    };
  }

  if (!latestRun) {
    return {
      exampleNumber: example.number,
      criterionCode: code,
      studentEmail: example.studentEmail,
      status: "missing_ai_review",
      score: 0,
      maxScore: 0,
      officialComment,
      officialFocusTerms: getPresentFocusTerms(code, officialComment),
      matchedFocusTerms: [],
      keywordOverlap: [],
      aiReviewRunId: null,
      checks: [
        {
          name: "AI review exists",
          pass: false,
          severity: "missing",
          detail: "Run AI review for this official example criterion.",
        },
      ],
    };
  }

  const normalizedReview = normalizeReview(latestRun);
  const checks = evaluateReviewAgainstOfficialComment({
    criterionCode: code,
    review: normalizedReview,
    officialComment,
  });
  const scoredChecks = checks.filter((check) => check.severity !== "info");
  const passedChecks = scoredChecks.filter((check) => check.pass);

  return {
    exampleNumber: example.number,
    criterionCode: code,
    studentEmail: example.studentEmail,
    status: latestRun.status,
    score: passedChecks.length,
    maxScore: scoredChecks.length,
    officialComment,
    officialFocusTerms: getPresentFocusTerms(code, officialComment),
    matchedFocusTerms: getPresentFocusTerms(code, normalizedReview.allText),
    keywordOverlap: getKeywordOverlap(officialComment, normalizedReview.allText),
    aiReviewRunId: latestRun.id,
    checks,
  };
}

async function loadSubmissionSlot({ classId, studentEmail, criterionCode }) {
  return prisma.submissionSlot.findFirst({
    where: {
      enrollment: {
        classId,
        student: { email: studentEmail },
      },
      criterion: { code: criterionCode },
    },
    include: {
      criterion: { select: { code: true, title: true } },
      latestVersion: { select: { id: true, versionNumber: true } },
      aiReviewRuns: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { findings: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
}

function normalizeReview(run) {
  const rawResponse = isRecord(run.rawResponse) ? run.rawResponse : {};
  const rubricAlignment = Array.isArray(rawResponse.rubricAlignment)
    ? rawResponse.rubricAlignment
    : [];
  const studentFeedbackDraft =
    typeof rawResponse.studentFeedbackDraft === "string"
      ? rawResponse.studentFeedbackDraft
      : "";
  const findings = run.findings.map((finding) => ({
    type: finding.type,
    text: finding.text,
  }));
  const allText = cleanText(
    [
      run.summary ?? "",
      studentFeedbackDraft,
      ...findings.map((finding) => finding.text),
      JSON.stringify(rubricAlignment),
    ].join("\n"),
  );

  return {
    id: run.id,
    status: run.status,
    summary: run.summary ?? "",
    rawResponse,
    rubricAlignment,
    studentFeedbackDraft,
    findings,
    allText,
  };
}

function evaluateReviewAgainstOfficialComment({
  criterionCode,
  review,
  officialComment,
}) {
  const officialFocusTerms = getPresentFocusTerms(criterionCode, officialComment);
  const matchedFocusTerms = getPresentFocusTerms(criterionCode, review.allText);
  const keywordOverlap = getKeywordOverlap(officialComment, review.allText);
  const checks = [];

  addCheck(checks, {
    name: "Completed AI review",
    pass: review.status === "completed",
    severity: "fail",
    detail: `status=${review.status}`,
  });
  addCheck(checks, {
    name: "Examiner comment section extracted",
    pass: officialComment.length > 80,
    severity: "fail",
    detail: `${officialComment.length} characters`,
  });
  addCheck(checks, {
    name: "Summary present",
    pass: review.summary.trim().length >= 40,
    severity: "fail",
    detail: `${review.summary.trim().length} characters`,
  });
  addCheck(checks, {
    name: "Uses 2027 standard language",
    pass: /2027|new syllabus|IB Computer Science IA/i.test(review.allText),
    severity: "warn",
    detail: "Expected explicit 2027 syllabus or IA standard signal.",
  });
  addCheck(checks, {
    name: "No mark or grade prediction",
    pass: !hasMarkPrediction(review.allText),
    severity: "fail",
    detail: "AI must not assign marks, scores, grade levels, or totals.",
  });
  addCheck(checks, {
    name: "Evidence-grounded feedback",
    pass: hasEvidenceSignal(review.allText),
    severity: "fail",
    detail: "Expected evidence, quote, locator, file name, or not-evidenced signal.",
  });
  addCheck(checks, {
    name: "Rubric alignment present",
    pass: review.rubricAlignment.length > 0,
    severity: "warn",
    detail: `${review.rubricAlignment.length} rubric alignment items`,
  });
  addCheck(checks, {
    name: "Student feedback draft present",
    pass: review.studentFeedbackDraft.trim().length > 0,
    severity: "warn",
    detail: `${review.studentFeedbackDraft.trim().length} characters`,
  });
  addCheck(checks, {
    name: "Student feedback draft has required Markdown headings",
    pass:
      /##\s+Summary/i.test(review.studentFeedbackDraft) &&
      /##\s+What is working/i.test(review.studentFeedbackDraft) &&
      /##\s+What to revise/i.test(review.studentFeedbackDraft) &&
      /##\s+Next actions/i.test(review.studentFeedbackDraft),
    severity: "warn",
    detail: "Expected Summary, What is working, What to revise, Next actions.",
  });
  addCheck(checks, {
    name: "Official focus-term coverage",
    pass:
      officialFocusTerms.length === 0 ||
      matchedFocusTerms.length >= Math.min(2, officialFocusTerms.length),
    severity: "warn",
    detail: `official=${officialFocusTerms.join(", ") || "none"}; matched=${
      matchedFocusTerms.join(", ") || "none"
    }`,
  });
  addCheck(checks, {
    name: "Official examiner keyword overlap",
    pass: keywordOverlap.length >= 2,
    severity: "warn",
    detail: keywordOverlap.join(", ") || "none",
  });

  return checks;
}

function addCheck(checks, check) {
  checks.push(check);
}

function extractCriterionComment(text, code) {
  const normalized = cleanText(text);
  const startPattern = new RegExp(`Criterion\\s+${code}\\s*:\\s*`, "i");
  const startMatch = normalized.match(startPattern);

  if (!startMatch || startMatch.index === undefined) {
    return "";
  }

  const start = startMatch.index;
  const afterStart = normalized.slice(start);
  const nextMatch = afterStart
    .slice(1)
    .match(/Criterion\s+[A-E]\s*:|Total\s+\d+\s+\d+/i);
  const end = nextMatch?.index === undefined ? normalized.length : start + 1 + nextMatch.index;

  return normalized.slice(start, end).trim();
}

function getPresentFocusTerms(code, text) {
  const normalized = text.toLowerCase();

  return (criterionFocusTerms[code] ?? []).filter((term) =>
    normalized.includes(term.toLowerCase()),
  );
}

function getKeywordOverlap(officialText, aiText) {
  const officialKeywords = topKeywords(officialText, 16);
  const aiKeywordSet = new Set(topKeywords(aiText, 80));

  return officialKeywords.filter((keyword) => aiKeywordSet.has(keyword)).slice(0, 10);
}

function topKeywords(text, limit) {
  const counts = new Map();
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^-+|-+$/g, ""))
    .filter((word) => word.length >= 4 && !stopWords.has(word));

  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([word]) => word)
    .slice(0, limit);
}

function hasEvidenceSignal(text) {
  return /Evidence:|quote|locator|file name|fileName|not evidenced|DP_Comp_sci|\.pdf/i.test(
    text,
  );
}

function hasMarkPrediction(text) {
  return (
    /\b\d+\s*\/\s*\d+\b/.test(text) ||
    /\b(mark|score|grade)\s*[:=]\s*\d+/i.test(text) ||
    /\blevel\s+[1-7]\b/i.test(text) ||
    /\bgrade\s+[1-7]\b/i.test(text)
  );
}

function buildReport({ classRecord, rows, examples }) {
  const completedRows = rows.filter((row) => row.status === "completed");
  const missingRows = rows.filter((row) => row.status === "missing_ai_review");
  const failedRows = rows.filter((row) => row.status === "failed");
  const scoredRows = completedRows.filter((row) => row.maxScore > 0);
  const averageScore =
    scoredRows.length === 0
      ? 0
      : scoredRows.reduce((sum, row) => sum + row.score / row.maxScore, 0) /
        scoredRows.length;

  return {
    generatedAt: new Date().toISOString(),
    class: classRecord,
    summary: {
      expectedExamples: expectedExampleCount,
      discoveredExamples: examples.length,
      expectedReviews: expectedExampleCount * criterionCodes.length,
      completedReviews: completedRows.length,
      missingReviews: missingRows.length,
      failedReviews: failedRows.length,
      averageQualityScore: Number(averageScore.toFixed(3)),
    },
    rows,
  };
}

async function writeReports({ report, outputDir }) {
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "official-examples-ai-review-benchmark.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(
    path.join(outputDir, "official-examples-ai-review-benchmark.md"),
    renderMarkdownReport(report),
  );
}

function renderMarkdownReport(report) {
  const lines = [
    "# Official IA Example AI Review Benchmark",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Class: ${report.class.name}`,
    `Teacher: ${report.class.teacher.name} <${report.class.teacher.email}>`,
    "",
    "## Summary",
    "",
    `- Expected reviews: ${report.summary.expectedReviews}`,
    `- Completed reviews: ${report.summary.completedReviews}`,
    `- Missing reviews: ${report.summary.missingReviews}`,
    `- Failed reviews: ${report.summary.failedReviews}`,
    `- Average quality score: ${Math.round(
      report.summary.averageQualityScore * 100,
    )}%`,
    "",
    "## Rows",
    "",
    "| Example | Criterion | Status | Score | Official focus | Matched focus | AI run |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const row of report.rows) {
    lines.push(
      [
        row.exampleNumber,
        row.criterionCode,
        row.status,
        row.maxScore ? `${row.score}/${row.maxScore}` : "-",
        escapeTable(row.officialFocusTerms.join(", ") || "-"),
        escapeTable(row.matchedFocusTerms.join(", ") || "-"),
        row.aiReviewRunId ?? "-",
      ].join(" | ").replace(/^/, "| ") + " |",
    );
  }

  lines.push("", "## Failed Checks", "");

  const failedRows = report.rows
    .map((row) => ({
      row,
      checks: row.checks.filter(
        (check) =>
          !check.pass &&
          (check.severity === "fail" || check.severity === "missing"),
      ),
    }))
    .filter((entry) => entry.checks.length > 0);

  if (failedRows.length === 0) {
    lines.push("No failed checks.");
  } else {
    for (const entry of failedRows) {
      lines.push(
        `- Example ${entry.row.exampleNumber} Criterion ${entry.row.criterionCode}: ${entry.checks
          .map((check) => `${check.name} (${check.detail})`)
          .join("; ")}`,
      );
    }
  }

  lines.push("");

  return `${lines.join("\n")}\n`;
}

function printSummary(report, outputDir) {
  console.log("Official IA AI review benchmark complete.");
  console.log(`Expected reviews: ${report.summary.expectedReviews}`);
  console.log(`Completed reviews: ${report.summary.completedReviews}`);
  console.log(`Missing reviews: ${report.summary.missingReviews}`);
  console.log(`Failed reviews: ${report.summary.failedReviews}`);
  console.log(
    `Average quality score: ${Math.round(report.summary.averageQualityScore * 100)}%`,
  );
  console.log(`Report: ${path.join(outputDir, "official-examples-ai-review-benchmark.md")}`);
}

function escapeTable(value) {
  return value.replace(/\|/g, "\\|");
}

function cleanText(value) {
  return value
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
