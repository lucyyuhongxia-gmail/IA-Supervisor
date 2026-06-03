import type { CriterionDef, Prisma, UserRole } from "@prisma/client";

import { createAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";

type SemanticSection = {
  key: string;
  label: string;
  status: string;
  snippets: string[];
};

type DescriptorEvidence = {
  section: string;
  status: "met" | "partial" | "missing" | "not_evidenced";
  evidence: string[];
  note: string;
};

export async function runMarkingAssistantForSlot({
  classId,
  slotId,
  requestedById,
  actorRole,
}: {
  classId: string;
  slotId: string;
  requestedById: string;
  actorRole: UserRole;
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
      latestVersion: true,
      semanticExtractions: {
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      aiReviewRuns: {
        where: { status: "completed" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!slot) {
    return { error: "Submission slot not found." };
  }

  if (!slot.latestVersionId || !slot.latestVersion) {
    return { error: "A submitted version is required before marking assistance." };
  }

  const latestVersionId = slot.latestVersionId;
  const semanticExtraction = slot.semanticExtractions.find(
    (extraction) => extraction.submissionVersionId === latestVersionId,
  );
  const sections = getSemanticSections(semanticExtraction?.extractedJson);
  const result = buildMarkingSuggestion({
    criterion: slot.criterion,
    sections,
    sourceCharacterCount: semanticExtraction?.sourceCharacterCount ?? 0,
    aiConfidence: slot.aiReviewRuns[0]?.confidence ?? null,
  });
  const sourceAIReviewRunId = slot.aiReviewRuns[0]?.id ?? null;

  const snapshot = await prisma.$transaction(async (tx) => {
    const created = await tx.markingSnapshot.create({
      data: {
        submissionSlotId: slot.id,
        submissionVersionId: latestVersionId,
        criterionId: slot.criterionId,
        requestedById,
        sourceAIReviewRunId,
        suggestedMarkMin: result.suggestedMarkMin,
        suggestedMarkMax: result.suggestedMarkMax,
        suggestedSingleMark: result.suggestedSingleMark,
        confidence: result.confidence,
        rationale: result.rationale,
        descriptorEvidenceJson:
          result.descriptorEvidence as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    await createAuditLog(
      {
        actorId: requestedById,
        actorRole,
        entityType: "submission_slot",
        entityId: slot.id,
        action: "marking_assistant.completed",
        toState: "completed",
        metadata: {
          classId,
          criterionId: slot.criterionId,
          submissionVersionId: latestVersionId,
          markingSnapshotId: created.id,
          suggestedMarkMin: result.suggestedMarkMin,
          suggestedMarkMax: result.suggestedMarkMax,
          confidence: result.confidence,
          sourceAIReviewRunId,
        },
      },
      tx,
    );

    return created;
  });

  return {
    success: "Marking assistant completed.",
    markingSnapshotId: snapshot.id,
  };
}

function buildMarkingSuggestion({
  criterion,
  sections,
  sourceCharacterCount,
  aiConfidence,
}: {
  criterion: CriterionDef;
  sections: SemanticSection[];
  sourceCharacterCount: number;
  aiConfidence: string | null;
}) {
  const descriptorEvidence = buildDescriptorEvidence(criterion, sections);
  const metCount = descriptorEvidence.filter((item) => item.status === "met").length;
  const partialCount = descriptorEvidence.filter(
    (item) => item.status === "partial",
  ).length;
  const evidenceScore =
    descriptorEvidence.length > 0
      ? (metCount + partialCount * 0.5) / descriptorEvidence.length
      : 0;
  const extractionPenalty = sourceCharacterCount < 500 ? 0.2 : 0;
  const aiConfidenceBoost =
    aiConfidence === "high" ? 0.05 : aiConfidence === "medium" ? 0.025 : 0;
  const score = Math.max(0, Math.min(1, evidenceScore - extractionPenalty + aiConfidenceBoost));
  const maxMarks = criterion.maxMarks;
  const suggestedMarkMax = Math.max(1, Math.min(maxMarks, Math.ceil(score * maxMarks)));
  const suggestedMarkMin = Math.max(
    0,
    Math.min(suggestedMarkMax, suggestedMarkMax - (score >= 0.75 ? 1 : 2)),
  );
  const suggestedSingleMark =
    suggestedMarkMax > 0 ? Math.floor((suggestedMarkMin + suggestedMarkMax) / 2) : 0;
  const confidence = getConfidence({
    sourceCharacterCount,
    descriptorEvidence,
    aiConfidence,
  });

  return {
    suggestedMarkMin,
    suggestedMarkMax,
    suggestedSingleMark,
    confidence,
    rationale: buildRationale({
      criterion,
      descriptorEvidence,
      score,
      sourceCharacterCount,
      aiConfidence,
    }),
    descriptorEvidence,
  };
}

function buildDescriptorEvidence(
  criterion: CriterionDef,
  sections: SemanticSection[],
): DescriptorEvidence[] {
  const expectedSections = getExpectedSections(criterion.code);

  return expectedSections.map((expected) => {
    const section = sections.find((item) => item.key === expected.key);
    const snippets = section?.snippets.slice(0, 2) ?? [];
    const sectionStatus = section?.status ?? "not_found";

    if (sectionStatus === "found" && snippets.length > 0) {
      return {
        section: expected.label,
        status: "met" as const,
        evidence: snippets,
        note: expected.metNote,
      };
    }

    if (sectionStatus === "found" || snippets.length > 0) {
      return {
        section: expected.label,
        status: "partial" as const,
        evidence: snippets,
        note: expected.partialNote,
      };
    }

    return {
      section: expected.label,
      status: "missing" as const,
      evidence: [],
      note: expected.missingNote,
    };
  });
}

function getExpectedSections(code: string) {
  switch (code) {
    case "A":
      return [
        expected("problemScenario", "Problem scenario", "Problem context is evidenced.", "Problem context needs teacher verification.", "No clear problem scenario was extracted."),
        expected("solutionRequirements", "Solution requirements", "Requirements are evidenced.", "Requirements are only partly evidenced.", "No clear solution requirements were extracted."),
        expected("successCriteria", "Success criteria", "Success criteria are evidenced.", "Success criteria need teacher verification.", "No clear success criteria were extracted."),
        expected("computationalContext", "Computational context", "Computational suitability is evidenced.", "Computational suitability is partial.", "No computational context was extracted."),
      ];
    case "B":
      return [
        expected("decomposition", "Decomposition", "Decomposition is evidenced.", "Decomposition needs verification.", "No decomposition evidence was extracted."),
        expected("planningItems", "Planning items", "Planning evidence is present.", "Planning evidence is partial.", "No planning evidence was extracted."),
        expected("designRationale", "Design rationale", "Design rationale is evidenced.", "Design rationale is partial.", "No design rationale was extracted."),
      ];
    case "C":
      return [
        expected("systemModel", "System model", "System model evidence is present.", "System model evidence is partial.", "No system model evidence was extracted."),
        expected("algorithms", "Algorithms", "Algorithm evidence is present.", "Algorithm evidence is partial.", "No algorithm evidence was extracted."),
        expected("testingStrategy", "Testing strategy", "Testing strategy evidence is present.", "Testing strategy is partial.", "No testing strategy was extracted."),
      ];
    case "D":
      return [
        expected("implementationTechniques", "Implementation techniques", "Implementation techniques are evidenced.", "Implementation techniques are partial.", "No implementation technique evidence was extracted."),
        expected("implementationEvidence", "Implementation evidence", "Implementation evidence is present.", "Implementation evidence is partial.", "No implementation evidence was extracted."),
        expected("testingEffectiveness", "Testing effectiveness", "Testing effectiveness evidence is present.", "Testing effectiveness is partial.", "No testing effectiveness evidence was extracted."),
      ];
    case "E":
      return [
        expected("evaluationAgainstSuccessCriteria", "Evaluation against success criteria", "Evaluation evidence is present.", "Evaluation evidence is partial.", "No evaluation-against-success-criteria evidence was extracted."),
        expected("limitations", "Limitations", "Limitations are evidenced.", "Limitations are partial.", "No limitations were extracted."),
        expected("futureImprovements", "Future improvements", "Future improvements are evidenced.", "Future improvements are partial.", "No future improvements were extracted."),
      ];
    default:
      return [
        expected("criterionEvidence", "Criterion evidence", "Criterion evidence is present.", "Criterion evidence is partial.", "No criterion evidence was extracted."),
      ];
  }
}

function expected(
  key: string,
  label: string,
  metNote: string,
  partialNote: string,
  missingNote: string,
) {
  return { key, label, metNote, partialNote, missingNote };
}

function getSemanticSections(value: unknown): SemanticSection[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const sections = (value as { sections?: unknown }).sections;

  if (!Array.isArray(sections)) {
    return [];
  }

  return sections
    .map((section) => {
      if (!section || typeof section !== "object" || Array.isArray(section)) {
        return null;
      }

      const record = section as Record<string, unknown>;
      const key = typeof record.key === "string" ? record.key : "";
      const label = typeof record.label === "string" ? record.label : key;
      const status =
        typeof record.status === "string" ? record.status : "not_found";
      const snippets = Array.isArray(record.snippets)
        ? record.snippets.filter((item): item is string => typeof item === "string")
        : [];

      if (!key) {
        return null;
      }

      return { key, label, status, snippets };
    })
    .filter((section): section is SemanticSection => Boolean(section));
}

function getConfidence({
  sourceCharacterCount,
  descriptorEvidence,
  aiConfidence,
}: {
  sourceCharacterCount: number;
  descriptorEvidence: DescriptorEvidence[];
  aiConfidence: string | null;
}) {
  const missingCount = descriptorEvidence.filter(
    (item) => item.status === "missing",
  ).length;

  if (sourceCharacterCount < 500 || missingCount >= descriptorEvidence.length / 2) {
    return "low";
  }

  if (aiConfidence === "high" && missingCount === 0) {
    return "high";
  }

  return "medium";
}

function buildRationale({
  criterion,
  descriptorEvidence,
  score,
  sourceCharacterCount,
  aiConfidence,
}: {
  criterion: CriterionDef;
  descriptorEvidence: DescriptorEvidence[];
  score: number;
  sourceCharacterCount: number;
  aiConfidence: string | null;
}) {
  const metCount = descriptorEvidence.filter((item) => item.status === "met").length;
  const partialCount = descriptorEvidence.filter(
    (item) => item.status === "partial",
  ).length;
  const missingCount = descriptorEvidence.filter(
    (item) => item.status === "missing",
  ).length;

  return [
    `Conservative marking assistance for Criterion ${criterion.code}: ${criterion.title} (${criterion.maxMarks} marks).`,
    `Evidence coverage: ${metCount} met, ${partialCount} partial, ${missingCount} missing across ${descriptorEvidence.length} rubric-relevant sections.`,
    `Source extraction length: ${sourceCharacterCount.toLocaleString()} characters.`,
    aiConfidence ? `Latest AI review confidence: ${aiConfidence}.` : "No completed AI review confidence was available.",
    `Rule score: ${Math.round(score * 100)}%. This is advisory only; teacher judgement and the official IB 2027 criteria remain final.`,
  ].join(" ");
}
