import type { DeliverableReviewMode, SubmissionStatus } from "@prisma/client";

export type FinalCriterionReadinessInput = {
  id: string;
  code: string;
  title?: string | null;
  status: SubmissionStatus | "not_started";
};

export type FinalDeliverableReadinessInput = {
  id: string;
  title: string;
  reviewMode: DeliverableReviewMode | string;
  status: SubmissionStatus | "not_started";
  hasEvidence: boolean;
};

export type FinalReadinessIssue = {
  scope: "criterion" | "deliverable";
  id: string;
  label: string;
  detail: string;
};

export type FinalReadiness = {
  isReady: boolean;
  criteriaPassedCount: number;
  deliverablesPassedCount: number;
  totalCriteria: number;
  totalDeliverables: number;
  issues: FinalReadinessIssue[];
};

export function buildFinalReadiness({
  criteria,
  deliverables,
}: {
  criteria: FinalCriterionReadinessInput[];
  deliverables: FinalDeliverableReadinessInput[];
}): FinalReadiness {
  const issues: FinalReadinessIssue[] = [];

  for (const criterion of criteria) {
    if (!isPassedOrFinal(criterion.status)) {
      issues.push({
        scope: "criterion",
        id: criterion.id,
        label: `Criterion ${criterion.code}`,
        detail: `Current status is ${formatStatusForReadiness(criterion.status)}. Teacher must mark it passed before final submission.`,
      });
    }
  }

  for (const deliverable of deliverables) {
    if (!deliverable.hasEvidence) {
      issues.push({
        scope: "deliverable",
        id: deliverable.id,
        label: deliverable.title,
        detail: "No submitted file or evidence link is available.",
      });
    }

    if (!isPassedOrFinal(deliverable.status)) {
      issues.push({
        scope: "deliverable",
        id: deliverable.id,
        label: deliverable.title,
        detail: `Current status is ${formatStatusForReadiness(deliverable.status)}. Teacher must mark this deliverable passed before final submission.`,
      });
    }
  }

  return {
    isReady: issues.length === 0 && criteria.length > 0,
    criteriaPassedCount: criteria.filter((criterion) =>
      isPassedOrFinal(criterion.status),
    ).length,
    deliverablesPassedCount: deliverables.filter((deliverable) =>
      isPassedOrFinal(deliverable.status),
    ).length,
    totalCriteria: criteria.length,
    totalDeliverables: deliverables.length,
    issues,
  };
}

export function isPassedOrFinal(status: SubmissionStatus | "not_started") {
  return status === "passed" || status === "final_submitted";
}

export function isFinalSubmitted(status: SubmissionStatus | "not_started") {
  return status === "final_submitted";
}

export function getDeliverableEvidenceState({
  latestVersion,
  slot,
}: {
  latestVersion?: {
    artifactUrl?: string | null;
    fileAssets?: unknown[];
  } | null;
  slot?: {
    artifactUrl?: string | null;
    fileAssets?: unknown[];
  } | null;
}) {
  const fileCount =
    latestVersion?.fileAssets?.length || slot?.fileAssets?.length || 0;
  const artifactUrl = latestVersion?.artifactUrl ?? slot?.artifactUrl ?? null;

  return {
    fileCount,
    artifactUrl,
    hasEvidence: fileCount > 0 || Boolean(artifactUrl),
  };
}

export function formatStatusForReadiness(
  status: SubmissionStatus | "not_started",
) {
  return status
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
