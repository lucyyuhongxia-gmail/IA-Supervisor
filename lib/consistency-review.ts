import { randomUUID } from "node:crypto";
import type {
  ConsistencyCheckSeverity,
  ConsistencyCheckStatus,
  CriterionDef,
  Prisma,
  UserRole,
} from "@prisma/client";

import { createAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";

type SemanticSection = {
  key: string;
  label: string;
  status: string;
  snippets: string[];
};

type ExtractionMapItem = {
  criterion: CriterionDef;
  sections: SemanticSection[];
  sourceCharacterCount: number;
};

type PlannedCheck = {
  checkType: string;
  title: string;
  sourceCode: string;
  targetCode: string;
  sourceSectionKeys: string[];
  targetSectionKeys: string[];
};

type BuiltCheck = {
  checkType: string;
  status: ConsistencyCheckStatus;
  severity: ConsistencyCheckSeverity;
  summary: string;
  sourceCriterionId?: string;
  targetCriterionId?: string;
  evidenceJson: Prisma.InputJsonValue;
};

const plannedChecks: PlannedCheck[] = [
  {
    checkType: "A_C_success_criteria_testing_alignment",
    title: "Criterion A success criteria should be tested in Criterion C.",
    sourceCode: "A",
    targetCode: "C",
    sourceSectionKeys: ["successCriteria", "solutionRequirements"],
    targetSectionKeys: ["testingStrategy"],
  },
  {
    checkType: "A_E_success_criteria_evaluation_alignment",
    title: "Criterion A success criteria should be evaluated in Criterion E.",
    sourceCode: "A",
    targetCode: "E",
    sourceSectionKeys: ["successCriteria", "solutionRequirements"],
    targetSectionKeys: ["evaluationAgainstSuccessCriteria"],
  },
  {
    checkType: "B_D_plan_development_alignment",
    title: "Criterion B planning should be reflected in Criterion D development.",
    sourceCode: "B",
    targetCode: "D",
    sourceSectionKeys: ["decomposition", "planningItems", "designRationale"],
    targetSectionKeys: ["implementationTechniques", "implementationEvidence"],
  },
  {
    checkType: "C_D_algorithm_implementation_alignment",
    title: "Criterion C system design and algorithms should appear in Criterion D implementation.",
    sourceCode: "C",
    targetCode: "D",
    sourceSectionKeys: ["systemModel", "algorithms"],
    targetSectionKeys: ["implementationTechniques", "implementationEvidence"],
  },
];

export async function runConsistencyReviewForEnrollment({
  classId,
  enrollmentId,
  requestedById,
  actorRole,
}: {
  classId: string;
  enrollmentId: string;
  requestedById: string;
  actorRole: UserRole;
}) {
  const enrollment = await prisma.enrollment.findFirst({
    where: {
      id: enrollmentId,
      classId,
      class: {
        teacherId: requestedById,
      },
    },
    include: {
      class: {
        include: {
          subject: {
            include: {
              criteria: true,
            },
          },
        },
      },
      submissionSlots: {
        include: {
          criterion: true,
        },
      },
    },
  });

  if (!enrollment) {
    return { error: "Student enrollment not found." };
  }

  const latestVersionIds = enrollment.submissionSlots
    .map((slot) => slot.latestVersionId)
    .filter((id): id is string => Boolean(id));
  const extractions =
    latestVersionIds.length > 0
      ? await prisma.semanticExtraction.findMany({
          where: {
            submissionVersionId: { in: latestVersionIds },
          },
          include: {
            criterion: true,
          },
        })
      : [];
  const extractionByCode = new Map<string, ExtractionMapItem>();

  for (const extraction of extractions) {
    extractionByCode.set(extraction.criterion.code, {
      criterion: extraction.criterion,
      sections: getSemanticSections(extraction.extractedJson),
      sourceCharacterCount: extraction.sourceCharacterCount,
    });
  }

  const criteriaByCode = new Map(
    enrollment.class.subject.criteria.map((criterion) => [criterion.code, criterion]),
  );
  const checks = plannedChecks.map((check) =>
    buildConsistencyCheck({
      check,
      criteriaByCode,
      extractionByCode,
    }),
  );
  const runId = randomUUID();

  await prisma.$transaction(async (tx) => {
    await Promise.all(
      checks.map((check) =>
        tx.consistencyCheck.create({
          data: {
            runId,
            classId,
            enrollmentId,
            sourceCriterionId: check.sourceCriterionId ?? null,
            targetCriterionId: check.targetCriterionId ?? null,
            requestedById,
            checkType: check.checkType,
            status: check.status,
            severity: check.severity,
            summary: check.summary,
            evidenceJson: check.evidenceJson,
          },
        }),
      ),
    );

    await createAuditLog(
      {
        actorId: requestedById,
        actorRole,
        entityType: "enrollment",
        entityId: enrollmentId,
        action: "consistency_review.completed",
        toState: "completed",
        metadata: {
          classId,
          enrollmentId,
          runId,
          checkCount: checks.length,
          criticalCount: checks.filter((check) => check.severity === "critical").length,
          warningCount: checks.filter((check) => check.severity === "warning").length,
        },
      },
      tx,
    );
  });

  return { success: "Consistency review completed.", runId };
}

function buildConsistencyCheck({
  check,
  criteriaByCode,
  extractionByCode,
}: {
  check: PlannedCheck;
  criteriaByCode: Map<string, CriterionDef>;
  extractionByCode: Map<string, ExtractionMapItem>;
}): BuiltCheck {
  const sourceCriterion = criteriaByCode.get(check.sourceCode);
  const targetCriterion = criteriaByCode.get(check.targetCode);
  const sourceExtraction = extractionByCode.get(check.sourceCode);
  const targetExtraction = extractionByCode.get(check.targetCode);

  if (!sourceExtraction || !targetExtraction) {
    const missing = [
      !sourceExtraction ? `Criterion ${check.sourceCode}` : null,
      !targetExtraction ? `Criterion ${check.targetCode}` : null,
    ]
      .filter(Boolean)
      .join(" and ");

    return {
      checkType: check.checkType,
      status: "insufficient_evidence",
      severity: "warning",
      summary: `${check.title} ${missing} does not have semantic extraction yet.`,
      sourceCriterionId: sourceCriterion?.id,
      targetCriterionId: targetCriterion?.id,
      evidenceJson: {
        title: check.title,
        missingExtractions: missing,
      },
    };
  }

  const sourceSections = selectSections(
    sourceExtraction.sections,
    check.sourceSectionKeys,
  );
  const targetSections = selectSections(
    targetExtraction.sections,
    check.targetSectionKeys,
  );
  const sourceSnippets = sourceSections.flatMap((section) => section.snippets);
  const targetSnippets = targetSections.flatMap((section) => section.snippets);

  if (sourceSnippets.length === 0) {
    return {
      checkType: check.checkType,
      status: "insufficient_evidence",
      severity: "warning",
      summary: `${check.title} No clear source evidence was extracted from Criterion ${check.sourceCode}.`,
      sourceCriterionId: sourceExtraction.criterion.id,
      targetCriterionId: targetExtraction.criterion.id,
      evidenceJson: buildEvidenceJson(check, sourceSections, targetSections, []),
    };
  }

  if (targetSnippets.length === 0) {
    return {
      checkType: check.checkType,
      status: "missing",
      severity: "critical",
      summary: `${check.title} Criterion ${check.targetCode} has no extracted target evidence.`,
      sourceCriterionId: sourceExtraction.criterion.id,
      targetCriterionId: targetExtraction.criterion.id,
      evidenceJson: buildEvidenceJson(check, sourceSections, targetSections, []),
    };
  }

  const overlap = getKeywordOverlap(sourceSnippets, targetSnippets);

  if (overlap.length >= 4) {
    return {
      checkType: check.checkType,
      status: "met",
      severity: "info",
      summary: `${check.title} Extracted evidence appears connected across Criteria ${check.sourceCode} and ${check.targetCode}.`,
      sourceCriterionId: sourceExtraction.criterion.id,
      targetCriterionId: targetExtraction.criterion.id,
      evidenceJson: buildEvidenceJson(check, sourceSections, targetSections, overlap),
    };
  }

  return {
    checkType: check.checkType,
    status: "partial",
    severity: "warning",
    summary: `${check.title} Both criteria contain relevant evidence, but the extracted overlap is weak. Teacher should verify alignment.`,
    sourceCriterionId: sourceExtraction.criterion.id,
    targetCriterionId: targetExtraction.criterion.id,
    evidenceJson: buildEvidenceJson(check, sourceSections, targetSections, overlap),
  };
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

function selectSections(sections: SemanticSection[], keys: string[]) {
  return sections.filter((section) => keys.includes(section.key));
}

function buildEvidenceJson(
  check: PlannedCheck,
  sourceSections: SemanticSection[],
  targetSections: SemanticSection[],
  overlap: string[],
): Prisma.InputJsonValue {
  return {
    title: check.title,
    sourceCriterion: check.sourceCode,
    targetCriterion: check.targetCode,
    sourceSections: sourceSections.map(toEvidenceSection),
    targetSections: targetSections.map(toEvidenceSection),
    overlappingKeywords: overlap,
  };
}

function toEvidenceSection(section: SemanticSection) {
  return {
    key: section.key,
    label: section.label,
    status: section.status,
    snippets: section.snippets.slice(0, 2),
  };
}

function getKeywordOverlap(sourceSnippets: string[], targetSnippets: string[]) {
  const sourceKeywords = extractKeywords(sourceSnippets.join(" "));
  const targetKeywords = extractKeywords(targetSnippets.join(" "));

  return Array.from(sourceKeywords)
    .filter((keyword) => targetKeywords.has(keyword))
    .slice(0, 12);
}

function extractKeywords(value: string) {
  const stopWords = new Set([
    "about",
    "after",
    "also",
    "because",
    "before",
    "being",
    "could",
    "each",
    "from",
    "have",
    "into",
    "more",
    "must",
    "only",
    "should",
    "system",
    "that",
    "their",
    "there",
    "these",
    "this",
    "through",
    "user",
    "users",
    "when",
    "where",
    "which",
    "will",
    "with",
    "would",
  ]);

  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 4 && !stopWords.has(word)),
  );
}
