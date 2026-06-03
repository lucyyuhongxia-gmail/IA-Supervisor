import type {
  CriterionDef,
  FileAsset,
  Prisma,
  SemanticExtractionStatus,
  UserRole,
} from "@prisma/client";

import { createAuditLog } from "@/lib/audit-log";
import { extractFileText } from "@/lib/file-extraction";
import { prisma } from "@/lib/prisma";

type ExtractionDiagnostic = {
  fileName: string;
  status: "success" | "limited";
  characterCount: number;
  message?: string;
};

type SemanticSection = {
  key: string;
  label: string;
  description: string;
  status: "found" | "not_found" | "limited";
  snippets: string[];
};

type SemanticExtractionPayload = {
  schemaVersion: "1.0";
  extractionType: "semantic_extraction";
  criterion: {
    id: string;
    code: string;
    title: string;
    maxMarks: number;
  };
  source: {
    fileCount: number;
    characterCount: number;
    diagnostics: ExtractionDiagnostic[];
  };
  sections: SemanticSection[];
  generatedAt: string;
};

type ReviewSlot = {
  id: string;
  criterionId: string;
  latestVersionId: string | null;
  criterion: CriterionDef;
  latestVersion:
    | {
        id: string;
        fileAssets: FileAsset[];
      }
    | null;
  fileAssets: FileAsset[];
};

export async function generateSemanticExtractionForSlot({
  slotId,
  actorId,
  actorRole,
  classId,
}: {
  slotId: string;
  actorId: string;
  actorRole: UserRole;
  classId?: string;
}) {
  const slot = await prisma.submissionSlot.findUnique({
    where: { id: slotId },
    include: {
      criterion: true,
      latestVersion: {
        include: {
          fileAssets: { orderBy: { createdAt: "desc" } },
        },
      },
      fileAssets: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!slot || !slot.latestVersionId || !slot.latestVersion) {
    return { error: "A submitted version is required before semantic extraction." };
  }

  const latestVersionId = slot.latestVersionId;
  const extractionDraft = await buildSemanticExtraction(slot);
  const status: SemanticExtractionStatus =
    extractionDraft.source.characterCount > 0 ? "generated" : "failed";
  const message =
    status === "failed"
      ? "No readable text was available for semantic extraction."
      : null;
  const confidence = getExtractionConfidence(extractionDraft.sections, status);

  const extraction = await prisma.$transaction(async (tx) => {
    const record = await tx.semanticExtraction.upsert({
      where: {
        submissionVersionId_criterionId: {
          submissionVersionId: latestVersionId,
          criterionId: slot.criterionId,
        },
      },
      update: {
        status,
        confidence,
        extractedJson: extractionDraft as unknown as Prisma.InputJsonValue,
        sourceCharacterCount: extractionDraft.source.characterCount,
        message,
        confirmedAt: null,
        confirmedById: null,
      },
      create: {
        submissionSlotId: slot.id,
        submissionVersionId: latestVersionId,
        criterionId: slot.criterionId,
        status,
        confidence,
        extractedJson: extractionDraft as unknown as Prisma.InputJsonValue,
        sourceCharacterCount: extractionDraft.source.characterCount,
        message,
      },
      select: { id: true },
    });

    await createAuditLog(
      {
        actorId,
        actorRole,
        entityType: "submission_slot",
        entityId: slot.id,
        action:
          status === "generated"
            ? "semantic_extraction.generated"
            : "semantic_extraction.failed",
        toState: status,
        reason: message,
        metadata: {
          classId,
          criterionId: slot.criterionId,
          submissionVersionId: latestVersionId,
          semanticExtractionId: record.id,
          sourceCharacterCount: extractionDraft.source.characterCount,
        },
      },
      tx,
    );

    return record;
  });

  return {
    success:
      status === "generated"
        ? "Semantic extraction generated."
        : "Semantic extraction could not find readable text.",
    extractionId: extraction.id,
  };
}

export async function confirmSemanticExtraction({
  extractionId,
  actorId,
  actorRole,
}: {
  extractionId: string;
  actorId: string;
  actorRole: UserRole;
}) {
  const existing = await prisma.semanticExtraction.findUnique({
    where: { id: extractionId },
    select: {
      id: true,
      submissionSlotId: true,
      submissionVersionId: true,
      criterionId: true,
      status: true,
    },
  });

  if (!existing) {
    return { error: "Semantic extraction not found." };
  }

  const confirmedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.semanticExtraction.update({
      where: { id: extractionId },
      data: {
        status:
          actorRole === "student" ? "student_confirmed" : "teacher_confirmed",
        confirmedAt,
        confirmedById: actorId,
      },
    });

    await createAuditLog(
      {
        actorId,
        actorRole,
        entityType: "submission_slot",
        entityId: existing.submissionSlotId,
        action:
          actorRole === "student"
            ? "semantic_extraction.student_confirmed"
            : "semantic_extraction.teacher_confirmed",
        fromState: existing.status,
        toState:
          actorRole === "student" ? "student_confirmed" : "teacher_confirmed",
        metadata: {
          semanticExtractionId: existing.id,
          submissionVersionId: existing.submissionVersionId,
          criterionId: existing.criterionId,
        },
      },
      tx,
    );
  });

  return { success: "Semantic extraction confirmed." };
}

async function buildSemanticExtraction(slot: ReviewSlot) {
  const files = slot.latestVersion?.fileAssets.length
    ? slot.latestVersion.fileAssets
    : slot.fileAssets;
  const diagnostics: ExtractionDiagnostic[] = [];
  const textParts = await Promise.all(
    files.map(async (file) => {
      const extraction = await extractFileText(file);
      diagnostics.push({
        fileName: file.originalName,
        status: extraction.status,
        characterCount: extraction.characterCount,
        message: extraction.message,
      });

      return extraction.status === "success" ? extraction.text : "";
    }),
  );
  const sourceText = textParts.filter(Boolean).join("\n\n");
  const definitions = getCriterionSectionDefinitions(slot.criterion.code);
  const sections: SemanticSection[] =
    sourceText.trim().length === 0
      ? definitions.map((definition) => ({
          ...definition,
          status: "limited",
          snippets: [],
        }))
      : definitions.map((definition) => {
          const snippets = findSnippets(sourceText, definition.keywords);

          return {
            key: definition.key,
            label: definition.label,
            description: definition.description,
            status: snippets.length > 0 ? "found" : "not_found",
            snippets,
          };
        });

  return {
    schemaVersion: "1.0",
    extractionType: "semantic_extraction",
    criterion: {
      id: slot.criterion.id,
      code: slot.criterion.code,
      title: slot.criterion.title,
      maxMarks: slot.criterion.maxMarks,
    },
    source: {
      fileCount: files.length,
      characterCount: diagnostics.reduce(
        (total, diagnostic) => total + diagnostic.characterCount,
        0,
      ),
      diagnostics,
    },
    sections,
    generatedAt: new Date().toISOString(),
  } satisfies SemanticExtractionPayload;
}

function getCriterionSectionDefinitions(code: string) {
  switch (code) {
    case "A":
      return [
        section("problemScenario", "Problem scenario", "Problem context, client/user, and need.", [
          "problem",
          "scenario",
          "client",
          "user",
          "need",
          "current",
        ]),
        section("solutionRequirements", "Solution requirements", "Functional requirements for the solution.", [
          "requirement",
          "requirements",
          "must",
          "should",
          "feature",
          "functionality",
        ]),
        section("successCriteria", "Success criteria", "Measurable outcomes used to judge success.", [
          "success criteria",
          "criterion",
          "criteria",
          "measure",
          "measurable",
          "evaluate",
        ]),
        section("computationalContext", "Computational context", "Why the problem is suitable for a coded solution.", [
          "computational",
          "algorithm",
          "database",
          "program",
          "system",
          "software",
        ]),
      ];
    case "B":
      return [
        section("decomposition", "Decomposition", "Breakdown of the problem into components.", [
          "decomposition",
          "component",
          "module",
          "breakdown",
          "subtask",
        ]),
        section("planningItems", "Planning items", "Plan, timeline, resources, and task sequence.", [
          "plan",
          "planning",
          "timeline",
          "schedule",
          "milestone",
          "task",
        ]),
        section("designRationale", "Design rationale", "Design decisions connected to the requirements.", [
          "design",
          "rationale",
          "justify",
          "choice",
          "decision",
        ]),
      ];
    case "C":
      return [
        section("systemModel", "System model", "Components, relationships, data flow, and interaction rules.", [
          "system model",
          "component",
          "relationship",
          "data flow",
          "architecture",
        ]),
        section("algorithms", "Algorithms", "Algorithmic design, pseudocode, flowcharts, or logic.", [
          "algorithm",
          "pseudocode",
          "flowchart",
          "logic",
          "procedure",
        ]),
        section("testingStrategy", "Testing strategy", "Tests aligned with success criteria and expected outcomes.", [
          "testing",
          "test case",
          "expected",
          "success criteria",
          "strategy",
        ]),
      ];
    case "D":
      return [
        section("implementationTechniques", "Implementation techniques", "Techniques, tools, libraries, and implementation choices.", [
          "implementation",
          "technique",
          "library",
          "framework",
          "code",
          "function",
        ]),
        section("implementationEvidence", "Implementation evidence", "Evidence that the product works and includes complexity.", [
          "evidence",
          "screenshot",
          "appendix",
          "source code",
          "complexity",
        ]),
        section("testingEffectiveness", "Testing effectiveness", "Correctness, reliability, efficiency, and video-supported tests.", [
          "testing",
          "correctness",
          "reliability",
          "efficiency",
          "video",
          "result",
        ]),
      ];
    case "E":
      return [
        section("evaluationAgainstSuccessCriteria", "Evaluation against success criteria", "Evaluation mapped back to Criterion A success criteria.", [
          "evaluation",
          "success criteria",
          "met",
          "not met",
          "partially",
        ]),
        section("limitations", "Limitations", "Known limitations of the final product.", [
          "limitation",
          "weakness",
          "constraint",
          "issue",
          "problem",
        ]),
        section("futureImprovements", "Future improvements", "Specific, justified improvements.", [
          "improvement",
          "future",
          "could",
          "recommend",
          "enhance",
        ]),
      ];
    default:
      return [
        section("criterionEvidence", "Criterion evidence", "Extracted evidence related to this criterion.", [
          "criterion",
          "evidence",
          "requirement",
          "testing",
          "evaluation",
        ]),
      ];
  }
}

function section(
  key: string,
  label: string,
  description: string,
  keywords: string[],
) {
  return { key, label, description, keywords };
}

function findSnippets(text: string, keywords: string[]) {
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());
  const paragraphs = text
    .split(/\n{2,}|(?<=\.)\s+(?=[A-Z])/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length >= 35);

  return paragraphs
    .map((paragraph) => {
      const lower = paragraph.toLowerCase();
      const score = normalizedKeywords.reduce(
        (total, keyword) => total + (lower.includes(keyword) ? 1 : 0),
        0,
      );

      return { paragraph, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => truncateSnippet(item.paragraph));
}

function truncateSnippet(value: string) {
  const maxLength = 420;

  return value.length > maxLength
    ? `${value.slice(0, maxLength).trim()}...`
    : value;
}

function getExtractionConfidence(
  sections: SemanticSection[],
  status: SemanticExtractionStatus,
) {
  if (status === "failed") {
    return "low";
  }

  const foundCount = sections.filter((section) => section.status === "found").length;
  const ratio = sections.length > 0 ? foundCount / sections.length : 0;

  if (ratio >= 0.7) {
    return "high";
  }

  if (ratio >= 0.4) {
    return "medium";
  }

  return "low";
}
