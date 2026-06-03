import type {
  AIReviewFindingType,
  CriterionDef,
  FileAsset,
  SubmissionSlot,
  SubmissionVersion,
  UserRole,
} from "@prisma/client";

import { createAuditLog } from "@/lib/audit-log";
import { getAssessmentReferenceForSubject } from "@/lib/assessment-reference";
import { extractFileText } from "@/lib/file-extraction";
import { prisma } from "@/lib/prisma";

type ReviewFinding = {
  type: AIReviewFindingType;
  text: string;
};

type AIReviewResult = {
  summary: string;
  strengths: string[];
  concerns: string[];
  suggestions: string[];
  rubricAlignment: RubricAlignmentItem[];
  confidence: "low" | "medium" | "high";
  studentFeedbackDraft?: string;
  teacherExaminerNotes?: string;
  rawResponse?: unknown;
};

type RubricAlignmentStatus = "met" | "partial" | "missing" | "not_evidenced";

type RubricAlignmentItem = {
  check: string;
  status: RubricAlignmentStatus;
  evidence: string;
};

type SubmissionContext = {
  text: string;
  extractionSucceeded: boolean;
  diagnostics: ExtractionDiagnostic[];
};

type ExtractionDiagnostic = {
  fileName: string;
  status: "success" | "limited";
  characterCount: number;
  message?: string;
};

type ReviewSlot = SubmissionSlot & {
  criterion: CriterionDef;
  latestVersion:
    | (SubmissionVersion & {
        fileAssets: FileAsset[];
      })
    | null;
  fileAssets: FileAsset[];
};

const MAX_REFERENCE_CHARS = 28000;

export async function runAIReviewForSlot({
  classId,
  slotId,
  requestedById,
}: {
  classId: string;
  slotId: string;
  requestedById: string;
}) {
  const slot = await prisma.submissionSlot.findFirst({
    where: {
      id: slotId,
      enrollment: {
        classId,
        class: {
          teacherId: requestedById,
        },
      },
    },
    include: {
      criterion: true,
      enrollment: {
        include: {
          class: {
            select: { subjectId: true },
          },
        },
      },
      latestVersion: {
        include: {
          fileAssets: { orderBy: { createdAt: "desc" } },
        },
      },
      fileAssets: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!slot) {
    return { error: "Submission slot not found." };
  }

  if (!slot.latestVersionId) {
    return { error: "Run AI review after the student submits a file." };
  }

  const reference = await getAssessmentReferenceForSubject(
    slot.enrollment.class.subjectId,
  );
  const config = getAIReviewConfig();
  const run = await prisma.aIReviewRun.create({
    data: {
      submissionSlotId: slot.id,
      submissionVersionId: slot.latestVersionId,
      criterionId: slot.criterionId,
      requestedById,
      provider: config.provider,
      modelName: config.modelName,
      referenceKey: reference.key,
      status: "pending",
    },
  });

  try {
    const submissionContext = await getSubmissionContext(slot);

    if (!submissionContext.extractionSucceeded) {
      await prisma.$transaction(async (tx) => {
        await tx.aIReviewRun.update({
          where: { id: run.id },
          data: {
            status: "failed",
            errorMessage:
              "AI review cannot run because no readable text was extracted from the submitted file.",
            rawResponse: {
              extraction: submissionContext.diagnostics,
              qualityControls: buildQualityControls({
                criterion: slot.criterion,
                referenceKey: reference.key,
                submissionContext,
              }),
              rubricAlignment: buildDefaultRubricAlignment(slot.criterion.code),
            },
          },
        });

        await createAuditLog(
          {
            actorId: requestedById,
            actorRole: "teacher" as UserRole,
            entityType: "submission_slot",
            entityId: slot.id,
            action: "ai_review.failed",
            toState: "failed",
            reason: "No readable text was extracted from the submitted file.",
            metadata: {
              classId,
              aiReviewRunId: run.id,
              submissionSlotId: slot.id,
              submissionVersionId: slot.latestVersionId,
              criterionId: slot.criterionId,
              provider: config.provider,
              modelName: config.modelName,
              referenceKey: reference.key,
            },
          },
          tx,
        );
      });

      return {
        error:
          "AI review cannot run because no readable text was extracted from the submitted file.",
      };
    }

    const result =
      config.provider === "deepseek" && config.apiKey
        ? await runDeepSeekReview({
            config,
            criterion: slot.criterion,
            referenceText: truncate(reference.content, MAX_REFERENCE_CHARS),
            referenceKey: reference.key,
            submissionContext,
        })
        : createMockReview({
            criterion: slot.criterion,
            submissionContext,
            provider: config.provider,
          });

    const findings = toFindings(result);

    await prisma.$transaction(async (tx) => {
      await tx.aIReviewFinding.deleteMany({
        where: { aiReviewRunId: run.id },
      });
      await tx.aIReviewRun.update({
        where: { id: run.id },
        data: {
          status: "completed",
          summary: result.summary,
          confidence: result.confidence,
          rawResponse:
            result.rawResponse === undefined
              ? undefined
              : JSON.parse(JSON.stringify(result.rawResponse)),
        },
      });
      await Promise.all(
        findings.map((finding, index) =>
          tx.aIReviewFinding.create({
            data: {
              aiReviewRunId: run.id,
              type: finding.type,
              text: finding.text,
              sortOrder: index,
            },
          }),
        ),
      );
      await createAuditLog(
        {
          actorId: requestedById,
          actorRole: "teacher" as UserRole,
          entityType: "submission_slot",
          entityId: slot.id,
          action: "ai_review.completed",
          toState: "completed",
          metadata: {
            classId,
            aiReviewRunId: run.id,
            submissionSlotId: slot.id,
            submissionVersionId: slot.latestVersionId,
            criterionId: slot.criterionId,
            provider: config.provider,
            modelName: config.modelName,
            referenceKey: reference.key,
            findingCount: findings.length,
            confidence: result.confidence,
          },
        },
        tx,
      );
    });

    return { success: "AI review completed." };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI review failed unexpectedly.";

    await prisma.$transaction(async (tx) => {
      await tx.aIReviewRun.update({
        where: { id: run.id },
        data: {
          status: "failed",
          errorMessage: message,
        },
      });

      await createAuditLog(
        {
          actorId: requestedById,
          actorRole: "teacher" as UserRole,
          entityType: "submission_slot",
          entityId: slot.id,
          action: "ai_review.failed",
          toState: "failed",
          reason: message,
          metadata: {
            classId,
            aiReviewRunId: run.id,
            submissionSlotId: slot.id,
            submissionVersionId: slot.latestVersionId,
            criterionId: slot.criterionId,
            provider: config.provider,
            modelName: config.modelName,
            referenceKey: reference.key,
          },
        },
        tx,
      );
    });

    return { error: message };
  }
}

function getAIReviewConfig() {
  const provider =
    process.env.AI_REVIEW_PROVIDER?.trim().toLowerCase() ||
    (process.env.DEEPSEEK_API_KEY ? "deepseek" : "mock");

  if (provider === "deepseek" && process.env.DEEPSEEK_API_KEY) {
    return {
      provider,
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      modelName: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    };
  }

  return {
    provider: "mock",
    apiKey: undefined,
    baseUrl: undefined,
    modelName: "mock-ai-review",
  };
}

async function getSubmissionContext(slot: ReviewSlot) {
  const files = slot.latestVersion?.fileAssets.length
    ? slot.latestVersion.fileAssets
    : slot.fileAssets;

  if (files.length === 0) {
    return {
      text: "No submitted file is attached to this criterion.",
      extractionSucceeded: false,
      diagnostics: [],
    };
  }

  const diagnostics: ExtractionDiagnostic[] = [];
  const fileSections = await Promise.all(
    files.map(async (file, index) => {
      const extraction = await extractFileText(file);
      const diagnostic: ExtractionDiagnostic = {
        fileName: file.originalName,
        status: extraction.status,
        characterCount: extraction.characterCount,
        message: extraction.message,
      };

      diagnostics.push(diagnostic);

      const metadata = [
        `File ${index + 1}: ${file.originalName}`,
        `MIME type: ${file.mimeType}`,
        `Size: ${file.sizeBytes} bytes`,
        `Extraction status: ${diagnostic.status}`,
        `Extracted character count: ${diagnostic.characterCount}`,
      ].join("\n");

      return `${metadata}\n\nExtracted text:\n${extraction.text}`;
    }),
  );

  const versionMetadata = [
    `Submitted version: ${slot.latestVersion?.versionNumber ?? "unknown"}`,
    slot.latestVersion?.notes ? `Student note: ${slot.latestVersion.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    text: `${versionMetadata}\n\n${fileSections.join("\n\n---\n\n")}`,
    extractionSucceeded: diagnostics.some(
      (diagnostic) =>
        diagnostic.status === "success" && diagnostic.characterCount > 0,
    ),
    diagnostics,
  };
}

async function runDeepSeekReview({
  config,
  criterion,
  referenceText,
  referenceKey,
  submissionContext,
}: {
  config: ReturnType<typeof getAIReviewConfig>;
  criterion: CriterionDef;
  referenceText: string;
  referenceKey: string;
  submissionContext: SubmissionContext;
}): Promise<AIReviewResult> {
  if (!config.apiKey || !config.baseUrl) {
    return createMockReview({
      criterion,
      submissionContext,
      provider: "mock",
    });
  }

  const response =
    (await callDeepSeekChatCompletion({
      config,
      criterion,
      referenceText,
      submissionContext,
      useResponseFormat: true,
    })) ??
    (await callDeepSeekChatCompletion({
      config,
      criterion,
      referenceText,
      submissionContext,
      useResponseFormat: false,
    }));

  if (!response) {
    throw new Error("DeepSeek review failed before returning a response.");
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("DeepSeek returned an empty review response.");
  }

  const parsed = normalizeAIReviewJson(parseJsonObject(content));
  assertAIReviewDidNotContradictExtraction(parsed, submissionContext);

  return {
    ...parsed,
    rawResponse: {
      providerPayload: payload,
      extraction: submissionContext.diagnostics,
      qualityControls: buildQualityControls({
        criterion,
        referenceKey,
        submissionContext,
      }),
      rubricAlignment: parsed.rubricAlignment,
      studentFeedbackDraft: parsed.studentFeedbackDraft,
      teacherExaminerNotes: parsed.teacherExaminerNotes,
    },
  };
}

async function callDeepSeekChatCompletion({
  config,
  criterion,
  referenceText,
  submissionContext,
  useResponseFormat,
}: {
  config: ReturnType<typeof getAIReviewConfig>;
  criterion: CriterionDef;
  referenceText: string;
  submissionContext: SubmissionContext;
  useResponseFormat: boolean;
}) {
  const response = await fetch(
    `${config.baseUrl?.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.modelName,
        temperature: 0.2,
        ...(useResponseFormat
          ? { response_format: { type: "json_object" } }
          : {}),
        messages: [
          {
            role: "system",
            content: buildExaminerSystemPrompt(),
          },
          {
            role: "user",
            content: [
              `Selected criterion: ${criterion.code} - ${criterion.title} (${criterion.maxMarks} marks)`,
              "Assessment standard lock: use only the IB Computer Science IA 2027 syllabus reference provided here. Do not use older IB Computer Science IA criteria, older criterion names, older mark allocations, or generic project-rubric assumptions.",
              "Criterion-specific checklist:",
              getCriterionReviewChecklist(criterion.code),
              "Student submission context. Treat this as authoritative evidence from the server-side extractor:",
              submissionContext.text,
              "Assessment reference:",
              referenceText,
              buildExaminerResponseInstructions(criterion.code),
            ].join("\n\n"),
          },
        ],
      }),
    },
  );

  if (response.ok) {
    return response;
  }

  if (useResponseFormat && response.status === 400) {
    return null;
  }

  const body = await response.text();
  throw new Error(`DeepSeek review failed: ${response.status} ${body}`);
}

function buildExaminerSystemPrompt() {
  return [
    "You are an experienced IB DP Computer Science IA teacher and examiner supporting the teacher.",
    "Return only valid JSON. Do not use Markdown outside JSON.",
    "Use only the IB Computer Science IA 2027 assessment standard and the extracted student submission text provided by the server.",
    "Do not assign final marks, predict grades, or change submission status. Teacher judgement remains final.",
    "The submission extraction metadata is authoritative. If it says Extraction status: success and extracted character count is greater than 0, you must review the extracted text and you must not claim the file is unreadable, empty, unavailable, corrupted, or could not be parsed.",
    "File names are metadata only. Do not infer criterion mismatch or readability from a file name when extracted text is available.",
    "Every concern and suggestion must be grounded in student evidence. If evidence is absent, say not evidenced and identify the missing syllabus requirement.",
    "Do not invent page numbers, paragraph numbers, features, tests, clients, code behavior, or video evidence. Use approximate locators only from visible headings, file names, or quoted text.",
    "Feedback should sound like an experienced IB CS teacher: specific, criterion-aligned, actionable, and concise.",
    "Avoid generic comments such as 'add more detail' unless you specify exactly what evidence or revision is needed.",
    "Do not write the IA section for the student. Give revision guidance, not replacement prose.",
  ].join(" ");
}

function buildExaminerResponseInstructions(criterionCode: string) {
  return [
    "Return this exact JSON shape:",
    JSON.stringify(
      {
        summary:
          "2-4 sentence examiner-style summary for the selected criterion only.",
        strengths: [
          {
            evidence: {
              fileName: "file name or not evidenced",
              locator: "visible heading, nearby phrase, or not evidenced",
              quote: "short quote from student text, or not evidenced",
            },
            point: "specific evidence-based strength",
            syllabusAlignment: `how this supports Criterion ${criterionCode} in the 2027 syllabus`,
          },
        ],
        concerns: [
          {
            evidence: {
              fileName: "file name or not evidenced",
              locator: "visible heading, nearby phrase, or not evidenced",
              quote: "short quote from student text, or not evidenced",
            },
            issueType: "missing | weak | unclear | misaligned | unsupported",
            severity: "minor | moderate | major",
            problem: "what is wrong or missing",
            whyItMatters: `why this matters for Criterion ${criterionCode} under the 2027 syllabus`,
            suggestedRevision: "specific action the student should take",
          },
        ],
        suggestions: [
          {
            evidence: {
              fileName: "file name or not evidenced",
              locator: "visible heading, nearby phrase, or not evidenced",
              quote: "short quote from student text, or not evidenced",
            },
            action: "specific revision action",
            expectedImprovement: `how it improves Criterion ${criterionCode} alignment`,
          },
        ],
        rubricAlignment: [
          {
            check: "checklist item",
            status: "met | partial | missing | not_evidenced",
            evidence:
              "short quote or not evidenced; do not invent evidence or locations",
          },
        ],
        studentFeedbackDraft:
          "concise draft feedback a teacher could adapt; must cite evidence and not assign marks",
        teacherExaminerNotes:
          "teacher-only notes about confidence, limitations, or what to verify manually",
        confidence: "low | medium | high",
      },
      null,
      2,
    ),
    "Evidence rules:",
    "- Quote no more than 35 words per evidence quote.",
    "- Use exact student wording where possible.",
    "- If you cannot locate evidence, use quote: \"not evidenced\" and explain the missing requirement.",
    "- Use visible document headings or nearby phrases as locator. Do not invent page numbers.",
    "- Review only the selected criterion.",
    "Bad feedback: \"Add more detail.\"",
    "Good feedback: \"Evidence: 'The librarian can search by title'. Issue: The success criterion is functional but not measurable. Why it matters: Criterion A requires success criteria that can later be evaluated. Revision guidance: Rewrite it as a testable outcome, such as search accuracy, acceptable response time, and expected results for valid/invalid searches.\"",
  ].join("\n\n");
}

function getCriterionReviewChecklist(code: string) {
  switch (code) {
    case "A":
      return [
        "Criterion A 2027 focus: problem scenario, measurable solution requirements, appropriate success criteria, and computational context.",
        "Check whether success criteria are measurable outcomes derived from solution requirements.",
        "Check whether the problem is suitable for a coded computational solution with enough DP Computer Science complexity.",
      ].join("\n");
    case "B":
      return [
        "Criterion B 2027 focus: decomposition and planning consistent with Criterion A.",
        "Check whether the decomposition breaks the problem into essential components.",
        "Check whether the plan addresses the success criteria and includes planning, design, development, testing, and evaluation chronology.",
      ].join("\n");
    case "C":
      return [
        "Criterion C 2027 focus: system model, component relationships, interaction rules, algorithms, UI, and testing strategy.",
        "Check whether a third party could understand how to recreate the product.",
        "Check whether the testing strategy aligns with success criteria and includes expected outcomes.",
      ].join("\n");
    case "D":
      return [
        "Criterion D 2027 focus: functional product, implementation techniques, algorithm implementation, and testing effectiveness.",
        "Check whether implementation choices are explained or evaluated, not merely listed.",
        "Check whether testing covers correctness, reliability, and efficiency with evidence supported by the video where relevant.",
      ].join("\n");
    case "E":
      return [
        "Criterion E 2027 focus: evaluation of the product against Criterion A success criteria and justified improvements.",
        "Check whether each success criterion is evaluated with evidence.",
        "Check whether proposed improvements are specific, realistic, and justified.",
      ].join("\n");
    default:
      return "Use the IB Computer Science IA 2027 assessment reference for this selected criterion.";
  }
}

function createMockReview({
  criterion,
  submissionContext,
  provider,
}: {
  criterion: CriterionDef;
  submissionContext: SubmissionContext;
  provider: string;
}): AIReviewResult {
  const extractionLimited = !submissionContext.extractionSucceeded;

  return {
    summary: extractionLimited
      ? `Mock review for Criterion ${criterion.code}. The workflow is connected, but the submitted file needs text extraction before content-level AI feedback is reliable.`
      : `Mock review for Criterion ${criterion.code}. The submission is ready for teacher review against ${criterion.title}.`,
    strengths: [
      `The student has submitted a file for Criterion ${criterion.code}.`,
      "The review can be tied to a specific submission version.",
    ],
    concerns: extractionLimited
      ? [
          "The current AI review cannot inspect the full file content for this file type yet.",
          "Teacher review should remain the source of judgement until PDF/DOCX extraction is added.",
        ]
      : [
          "This is a mock review because the configured provider is not active.",
          "Content-level rubric comments require a real AI provider and extracted submission text.",
        ],
    suggestions: [
      provider === "deepseek"
        ? "Check DEEPSEEK_API_KEY if you expected a real DeepSeek review."
        : "Set AI_REVIEW_PROVIDER=deepseek and DEEPSEEK_API_KEY to run a real AI review.",
      `Use the ${criterion.title} rubric reference when writing final teacher feedback.`,
    ],
    rubricAlignment: buildDefaultRubricAlignment(criterion.code),
    confidence: extractionLimited ? "low" : "medium",
    rawResponse: {
      extraction: submissionContext.diagnostics,
      qualityControls: buildQualityControls({
        criterion,
        referenceKey: "ib-cs-ia-2027",
        submissionContext,
      }),
      rubricAlignment: buildDefaultRubricAlignment(criterion.code),
    },
  };
}

function normalizeAIReviewJson(value: unknown): Omit<AIReviewResult, "rawResponse"> {
  const record = isRecord(value) ? value : {};

  return {
    summary:
      typeof record.summary === "string"
        ? record.summary
        : "AI review completed, but the response did not include a summary.",
    strengths: normalizeFindingArray(record.strengths, "strength"),
    concerns: normalizeFindingArray(record.concerns, "concern"),
    suggestions: normalizeFindingArray(record.suggestions, "suggestion"),
    rubricAlignment: normalizeRubricAlignment(record.rubricAlignment),
    confidence: normalizeConfidence(record.confidence),
    studentFeedbackDraft:
      typeof record.studentFeedbackDraft === "string"
        ? record.studentFeedbackDraft.trim()
        : undefined,
    teacherExaminerNotes:
      typeof record.teacherExaminerNotes === "string"
        ? record.teacherExaminerNotes.trim()
        : undefined,
  };
}

function assertAIReviewDidNotContradictExtraction(
  result: Omit<AIReviewResult, "rawResponse">,
  submissionContext: SubmissionContext,
) {
  if (!submissionContext.extractionSucceeded) {
    return;
  }

  const combinedText = [
    result.summary,
    ...result.strengths,
    ...result.concerns,
    ...result.suggestions,
  ]
    .join("\n")
    .toLowerCase();

  const invalidUnreadableClaims = [
    "could not be parsed",
    "could not be read",
    "couldn't be read",
    "no text was extracted",
    "no readable text",
    "no content is available",
    "content cannot be reviewed",
    "file is unreadable",
    "pdf parsing error",
    "technical error",
  ];

  if (invalidUnreadableClaims.some((claim) => combinedText.includes(claim))) {
    throw new Error(
      "AI review contradicted the server-side extraction result. The PDF text was extracted successfully, so please run AI review again.",
    );
  }
}

function parseJsonObject(content: string) {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  try {
    return JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(withoutFence.slice(start, end + 1));
    }

    throw new Error("AI review response was not valid JSON.");
  }
}

function toFindings(result: AIReviewResult): ReviewFinding[] {
  return [
    ...result.strengths.map((text) => ({ type: "strength" as const, text })),
    ...result.concerns.map((text) => ({ type: "concern" as const, text })),
    ...result.suggestions.map((text) => ({ type: "suggestion" as const, text })),
  ];
}

function normalizeFindingArray(
  value: unknown,
  type: "strength" | "concern" | "suggestion",
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeFindingItem(item, type))
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeFindingItem(
  item: unknown,
  type: "strength" | "concern" | "suggestion",
) {
  if (typeof item === "string") {
    return item.trim();
  }

  if (!isRecord(item)) {
    return "";
  }

  const evidence = normalizeEvidence(item.evidence);

  if (type === "strength") {
    const point = stringField(item.point) || stringField(item.strength);
    const alignment =
      stringField(item.syllabusAlignment) || stringField(item.whyItMatters);

    return joinFindingSections([
      formatEvidence(evidence),
      point ? `Strength: ${point}` : "",
      alignment ? `Syllabus alignment: ${alignment}` : "",
    ]);
  }

  if (type === "concern") {
    const issueType = stringField(item.issueType);
    const severity = stringField(item.severity);
    const problem = stringField(item.problem) || stringField(item.issue);
    const whyItMatters = stringField(item.whyItMatters);
    const suggestedRevision =
      stringField(item.suggestedRevision) || stringField(item.revisionGuidance);

    return joinFindingSections([
      formatEvidence(evidence),
      issueType || severity
        ? `Issue type: ${[issueType, severity].filter(Boolean).join(" · ")}`
        : "",
      problem ? `Issue: ${problem}` : "",
      whyItMatters ? `Why it matters: ${whyItMatters}` : "",
      suggestedRevision ? `Revision guidance: ${suggestedRevision}` : "",
    ]);
  }

  const action =
    stringField(item.action) ||
    stringField(item.suggestion) ||
    stringField(item.suggestedRevision);
  const expectedImprovement =
    stringField(item.expectedImprovement) || stringField(item.whyItMatters);

  return joinFindingSections([
    formatEvidence(evidence),
    action ? `Revision action: ${action}` : "",
    expectedImprovement ? `Expected improvement: ${expectedImprovement}` : "",
  ]);
}

function normalizeEvidence(value: unknown) {
  if (!isRecord(value)) {
    return {
      fileName: "not evidenced",
      locator: "not evidenced",
      quote: "not evidenced",
    };
  }

  return {
    fileName: stringField(value.fileName) || "not evidenced",
    locator: stringField(value.locator) || "not evidenced",
    quote: stringField(value.quote) || "not evidenced",
  };
}

function formatEvidence(evidence: {
  fileName: string;
  locator: string;
  quote: string;
}) {
  return `Evidence: ${evidence.fileName} · ${evidence.locator} · "${truncate(evidence.quote, 260)}"`;
}

function joinFindingSections(sections: string[]) {
  return sections.filter(Boolean).join("\n");
}

function stringField(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRubricAlignment(value: unknown): RubricAlignmentItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const check = typeof item.check === "string" ? item.check.trim() : "";
      const status = normalizeRubricAlignmentStatus(item.status);
      const evidence =
        typeof item.evidence === "string" ? item.evidence.trim() : "";

      if (!check) {
        return null;
      }

      return {
        check,
        status,
        evidence: evidence || "No specific evidence cited.",
      };
    })
    .filter((item): item is RubricAlignmentItem => item !== null)
    .slice(0, 8);
}

function normalizeRubricAlignmentStatus(value: unknown): RubricAlignmentStatus {
  return value === "met" ||
    value === "partial" ||
    value === "missing" ||
    value === "not_evidenced"
    ? value
    : "not_evidenced";
}

function normalizeConfidence(value: unknown): "low" | "medium" | "high" {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : "low";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n[truncated]` : value;
}

function buildQualityControls({
  criterion,
  referenceKey,
  submissionContext,
}: {
  criterion: CriterionDef;
  referenceKey: string;
  submissionContext: SubmissionContext;
}) {
  const successfulFiles = submissionContext.diagnostics.filter(
    (diagnostic) => diagnostic.status === "success" && diagnostic.characterCount > 0,
  ).length;
  const totalFiles = submissionContext.diagnostics.length;

  return {
    assessmentStandard: "IB Computer Science IA 2027",
    referenceKey,
    selectedCriterion: {
      code: criterion.code,
      title: criterion.title,
      maxMarks: criterion.maxMarks,
    },
    extraction: {
      status:
        successfulFiles === 0
          ? "limited"
          : successfulFiles === totalFiles
            ? "complete"
            : "partial",
      readableFiles: successfulFiles,
      totalFiles,
    },
    teacherDecisionPolicy:
      "AI review is draft support only. Teacher feedback and review status remain the official decision.",
  };
}

function buildDefaultRubricAlignment(code: string): RubricAlignmentItem[] {
  return getCriterionChecklistItems(code).map((check) => ({
    check,
    status: "not_evidenced",
    evidence: "Run a full AI review to capture evidence for this checklist item.",
  }));
}

function getCriterionChecklistItems(code: string) {
  switch (code) {
    case "A":
      return [
        "Problem scenario is specific and understandable.",
        "Solution requirements are measurable.",
        "Success criteria are derived from the requirements.",
        "Computational context and IA-level complexity are clear.",
      ];
    case "B":
      return [
        "Problem is decomposed into essential components.",
        "Plan is consistent with Criterion A success criteria.",
        "Timeline covers design, development, testing, and evaluation.",
        "Relevant research, tools, libraries, or dependencies are identified.",
      ];
    case "C":
      return [
        "System model identifies key components and relationships.",
        "User interface and interaction rules are represented.",
        "Algorithms are identified and presented clearly.",
        "Testing strategy aligns with success criteria and expected outcomes.",
      ];
    case "D":
      return [
        "Product functionality is clear and connected to the problem.",
        "Implementation techniques and algorithms are explained with evidence.",
        "Testing covers correctness, reliability, and efficiency.",
        "Video or appendix evidence supports functionality and code claims.",
      ];
    case "E":
      return [
        "Evaluation returns to Criterion A success criteria.",
        "Claims are supported by testing, product behavior, or user feedback.",
        "Improvements are specific, realistic, and justified.",
      ];
    default:
      return ["Selected criterion is reviewed against the active 2027 reference."];
  }
}
