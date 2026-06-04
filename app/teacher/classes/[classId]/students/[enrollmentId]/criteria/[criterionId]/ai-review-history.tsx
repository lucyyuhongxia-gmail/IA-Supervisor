"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AIReviewHistoryProps = {
  runs: AIReviewRunView[];
  latestVersionId: string | null;
};

type AIReviewRunView = {
  id: string;
  submissionVersionId: string | null;
  provider: string;
  modelName: string | null;
  referenceKey: string;
  status: string;
  summary: string | null;
  confidence: string | null;
  errorMessage: string | null;
  createdAtLabel: string;
  requestedByName: string;
  rawResponse: unknown;
  findings: Array<{
    id: string;
    type: string;
    text: string;
  }>;
};

type RubricAlignmentView = {
  check: string;
  status: string;
  evidence: string;
};

type QualityControlView = {
  assessmentStandard: string;
  referenceKey: string;
  extractionStatus: string;
  readableFiles: number;
  totalFiles: number;
  teacherDecisionPolicy: string;
};

export function AIReviewHistory({ runs, latestVersionId }: AIReviewHistoryProps) {
  const latestRun = runs[0];
  const olderRuns = runs.slice(1);

  return (
    <Card>
      <CardHeader className="p-4 pb-3">
        <CardTitle className="text-lg">AI review</CardTitle>
        <CardDescription>
          Latest draft notes using the IB CS IA 2027 syllabus. Teacher judgement remains final.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {latestRun ? (
          <div className="grid gap-3">
            <AIReviewQualityPanel run={latestRun} latestVersionId={latestVersionId} />
            <AIReviewRunCard
              run={latestRun}
              latestVersionId={latestVersionId}
              isLatest
            />
            {olderRuns.length > 0 ? (
              <details className="rounded-md border bg-muted/20 p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Older AI reviews ({olderRuns.length})
                </summary>
                <div className="mt-3 grid gap-3">
                  {olderRuns.map((run) => (
                    <AIReviewRunCard
                      key={run.id}
                      run={run}
                      latestVersionId={latestVersionId}
                    />
                  ))}
                </div>
              </details>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No AI review has been run for this criterion yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AIReviewQualityPanel({
  run,
  latestVersionId,
}: {
  run: AIReviewRunView;
  latestVersionId: string | null;
}) {
  const qualityControls = getAIReviewQualityControls(run);
  const rubricAlignment = getAIReviewRubricAlignment(run.rawResponse);
  const reviewCoversLatestVersion =
    Boolean(latestVersionId) && run.submissionVersionId === latestVersionId;

  return (
    <div className="grid gap-3 rounded-md border bg-muted/20 p-3 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-medium">AI review quality controls</p>
          <p className="mt-1 text-xs text-muted-foreground">
            These checks protect the teacher decision from stale reviews, weak extraction,
            or the wrong assessment standard.
          </p>
        </div>
        <span
          className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${
            reviewCoversLatestVersion
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {reviewCoversLatestVersion ? "Current version" : "Needs rerun"}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <QualityControlMetric
          label="Assessment"
          value={qualityControls.assessmentStandard}
          detail={qualityControls.referenceKey}
        />
        <QualityControlMetric
          label="Extraction"
          value={formatControlLabel(qualityControls.extractionStatus)}
          detail={`${qualityControls.readableFiles}/${qualityControls.totalFiles} readable files`}
        />
        <QualityControlMetric
          label="Teacher decision"
          value="Independent"
          detail="AI notes are draft support only"
        />
      </div>

      {rubricAlignment.length > 0 ? (
        <details className="rounded-md border bg-background">
          <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
            2027 rubric alignment
          </summary>
          <div className="grid gap-2 border-t p-3">
            {rubricAlignment.map((item) => (
              <div key={item.check} className="rounded-md border bg-background px-3 py-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <p className="font-medium">{item.check}</p>
                  <span
                    className={`inline-flex w-fit rounded-md border px-2 py-1 text-xs font-semibold ${getRubricAlignmentTone(item.status)}`}
                  >
                    {formatControlLabel(item.status)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{item.evidence}</p>
              </div>
            ))}
          </div>
        </details>
      ) : (
        <p className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
          This review was created before structured rubric alignment was captured.
          Run AI review again for criterion-level checklist evidence.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        {qualityControls.teacherDecisionPolicy}
      </p>
    </div>
  );
}

function QualityControlMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function AIReviewRunCard({
  run,
  latestVersionId,
  isLatest = false,
}: {
  run: AIReviewRunView;
  latestVersionId: string | null;
  isLatest?: boolean;
}) {
  const diagnostics = getAIReviewExtractionDiagnostics(run.rawResponse);
  const feedbackDraft = buildFeedbackDraft(run);
  const summaryDraft = buildSummaryFeedbackDraft(run);
  const concernsDraft = buildFindingFeedbackDraft(run, "Concerns", "concern");
  const suggestionsDraft = buildFindingFeedbackDraft(
    run,
    "Suggested next steps",
    "suggestion",
  );
  const primaryFindings = getPrimaryFindings(run.findings);
  const hiddenFindings = run.findings.filter(
    (finding) => !primaryFindings.some((item) => item.id === finding.id),
  );
  const isCompleted = run.status === "completed";
  const coversLatestVersion =
    Boolean(latestVersionId) && run.submissionVersionId === latestVersionId;

  return (
    <div
      className={`rounded-md border p-3 text-sm ${
        isLatest ? "bg-background shadow-sm" : "bg-background/70"
      } ${run.status === "failed" ? "opacity-80" : ""}`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">
              {run.provider}
              {run.modelName ? ` · ${run.modelName}` : ""}
            </p>
            {isLatest ? (
              <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800">
                Latest
              </span>
            ) : null}
            {coversLatestVersion ? (
              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                Current version
              </span>
            ) : (
              <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                Previous version
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {run.createdAtLabel} · {run.requestedByName}
          </p>
        </div>
        <p
          className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${getAIReviewStatusTone(run.status)}`}
        >
          {formatAIReviewStatus(run.status)}
        </p>
      </div>

      {diagnostics.length > 0 ? (
        <div className="mt-3 grid gap-1 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {diagnostics.map((diagnostic) => (
            <p key={`${run.id}-${diagnostic.fileName}`}>
              Extraction: {diagnostic.status} · {diagnostic.characterCount} chars ·{" "}
              {diagnostic.fileName}
            </p>
          ))}
        </div>
      ) : null}

      {run.summary ? (
        <p className="mt-3 whitespace-pre-wrap rounded-md border bg-muted/20 px-3 py-2 text-muted-foreground">
          {run.summary}
        </p>
      ) : null}
      {run.errorMessage ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-700">
          {run.errorMessage}
        </p>
      ) : null}
      {primaryFindings.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {primaryFindings.map((finding) => (
            <div
              key={finding.id}
              className={`rounded-md border px-3 py-2 ${getFindingTone(finding.type)}`}
            >
              <p className="text-xs font-semibold uppercase">{finding.type}</p>
              <p className="mt-1 whitespace-pre-wrap">{finding.text}</p>
            </div>
          ))}
        </div>
      ) : null}
      {hiddenFindings.length > 0 ? (
        <details className="mt-3 rounded-md border bg-muted/20">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
            All AI findings ({run.findings.length})
          </summary>
          <div className="grid gap-2 border-t p-3">
            {run.findings.map((finding) => (
              <div
                key={finding.id}
                className={`rounded-md border px-3 py-2 ${getFindingTone(finding.type)}`}
              >
                <p className="text-xs font-semibold uppercase">{finding.type}</p>
                <p className="mt-1 whitespace-pre-wrap">{finding.text}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {run.confidence ? (
          <p className="text-xs text-muted-foreground">
            Confidence: {run.confidence}
          </p>
        ) : (
          <span />
        )}
        {isCompleted ? (
          <div className="flex flex-wrap gap-2">
            {summaryDraft ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => copyToFeedback(summaryDraft)}
              >
                Copy summary
              </Button>
            ) : null}
            {concernsDraft ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => copyToFeedback(concernsDraft)}
              >
                Copy concerns
              </Button>
            ) : null}
            {suggestionsDraft ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => copyToFeedback(suggestionsDraft)}
              >
                Copy suggestions
              </Button>
            ) : null}
            {feedbackDraft ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => copyToFeedback(feedbackDraft)}
              >
                Copy full draft
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function getPrimaryFindings(findings: AIReviewRunView["findings"]) {
  const orderedTypes = ["concern", "suggestion", "strength"];
  const selected: AIReviewRunView["findings"] = [];

  for (const type of orderedTypes) {
    for (const finding of findings.filter((item) => item.type === type)) {
      if (selected.length >= 3) {
        return selected;
      }

      selected.push(finding);
    }
  }

  return selected;
}

function buildFeedbackDraft(run: AIReviewRunView) {
  const sections = [
    run.summary
      ? `## AI review summary\n${truncateText(run.summary, 450)}`
      : null,
    formatFindingSection("Strengths", run.findings, "strength", 2),
    formatFindingSection("Concerns", run.findings, "concern", 2),
    formatFindingSection("Suggested next steps", run.findings, "suggestion", 2),
  ].filter(Boolean);

  return truncateText(sections.join("\n\n"), 1800);
}

function buildSummaryFeedbackDraft(run: AIReviewRunView) {
  return run.summary
    ? `## AI review summary\n${truncateText(run.summary, 700)}`
    : "";
}

function buildFindingFeedbackDraft(
  run: AIReviewRunView,
  title: string,
  type: string,
) {
  return formatFindingSection(title, run.findings, type, 3) ?? "";
}

function formatFindingSection(
  title: string,
  findings: AIReviewRunView["findings"],
  type: string,
  limit: number,
) {
  const matchingFindings = findings
    .filter((finding) => finding.type === type)
    .slice(0, limit);

  if (matchingFindings.length === 0) {
    return null;
  }

  return `## ${title}\n${matchingFindings
    .map((finding) => `- ${truncateText(finding.text, 320)}`)
    .join("\n")}`;
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength
    ? `${value.slice(0, Math.max(0, maxLength - 1)).trim()}...`
    : value;
}

function copyToFeedback(feedbackDraft: string) {
  window.dispatchEvent(
    new CustomEvent("ia-supervisor:copy-ai-feedback", {
      detail: { feedbackDraft },
    }),
  );
}

function formatAIReviewStatus(status: string) {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getAIReviewStatusTone(status: string) {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "failed":
      return "border-red-200 bg-red-50 text-red-700";
    case "pending":
    default:
      return "border-blue-200 bg-blue-50 text-blue-800";
  }
}

function getRubricAlignmentTone(status: string) {
  switch (status) {
    case "met":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "partial":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "missing":
      return "border-red-200 bg-red-50 text-red-700";
    case "not_evidenced":
    default:
      return "border-amber-200 bg-amber-50 text-amber-800";
  }
}

function getFindingTone(type: string) {
  switch (type) {
    case "strength":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "concern":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "suggestion":
    default:
      return "border-blue-200 bg-blue-50 text-blue-800";
  }
}

function getAIReviewExtractionDiagnostics(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.extraction)) {
    return [];
  }

  return value.extraction
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      return {
        fileName:
          typeof item.fileName === "string" ? item.fileName : "Unknown file",
        status: typeof item.status === "string" ? item.status : "unknown",
        characterCount:
          typeof item.characterCount === "number" ? item.characterCount : 0,
      };
    })
    .filter(
      (
        item,
      ): item is {
        fileName: string;
        status: string;
        characterCount: number;
      } => item !== null,
    );
}

function getAIReviewQualityControls(run: AIReviewRunView): QualityControlView {
  const rawResponse = run.rawResponse;

  if (isRecord(rawResponse) && isRecord(rawResponse.qualityControls)) {
    const qualityControls = rawResponse.qualityControls;
    const extraction = isRecord(qualityControls.extraction)
      ? qualityControls.extraction
      : {};

    return {
      assessmentStandard:
        typeof qualityControls.assessmentStandard === "string"
          ? qualityControls.assessmentStandard
          : "IB Computer Science IA 2027",
      referenceKey:
        typeof qualityControls.referenceKey === "string"
          ? qualityControls.referenceKey
          : run.referenceKey,
      extractionStatus:
        typeof extraction.status === "string"
          ? extraction.status
          : inferExtractionStatus(getAIReviewExtractionDiagnostics(rawResponse)),
      readableFiles:
        typeof extraction.readableFiles === "number"
          ? extraction.readableFiles
          : countReadableFiles(getAIReviewExtractionDiagnostics(rawResponse)),
      totalFiles:
        typeof extraction.totalFiles === "number"
          ? extraction.totalFiles
          : getAIReviewExtractionDiagnostics(rawResponse).length,
      teacherDecisionPolicy:
        typeof qualityControls.teacherDecisionPolicy === "string"
          ? qualityControls.teacherDecisionPolicy
          : "AI review is draft support only. Teacher feedback and review status remain the official decision.",
    };
  }

  const diagnostics = getAIReviewExtractionDiagnostics(rawResponse);

  return {
    assessmentStandard: "IB Computer Science IA 2027",
    referenceKey: run.referenceKey,
    extractionStatus: inferExtractionStatus(diagnostics),
    readableFiles: countReadableFiles(diagnostics),
    totalFiles: diagnostics.length,
    teacherDecisionPolicy:
      "AI review is draft support only. Teacher feedback and review status remain the official decision.",
  };
}

function getAIReviewRubricAlignment(value: unknown): RubricAlignmentView[] {
  if (!isRecord(value) || !Array.isArray(value.rubricAlignment)) {
    return [];
  }

  return value.rubricAlignment
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const check = typeof item.check === "string" ? item.check.trim() : "";
      const status = typeof item.status === "string" ? item.status : "not_evidenced";
      const evidence =
        typeof item.evidence === "string"
          ? item.evidence.trim()
          : "No specific evidence cited.";

      if (!check) {
        return null;
      }

      return { check, status, evidence };
    })
    .filter((item): item is RubricAlignmentView => item !== null);
}

function inferExtractionStatus(
  diagnostics: Array<{ status: string; characterCount: number }>,
) {
  if (diagnostics.length === 0) {
    return "limited";
  }

  const readableFiles = countReadableFiles(diagnostics);

  if (readableFiles === 0) {
    return "limited";
  }

  return readableFiles === diagnostics.length ? "complete" : "partial";
}

function countReadableFiles(
  diagnostics: Array<{ status: string; characterCount: number }>,
) {
  return diagnostics.filter(
    (diagnostic) =>
      diagnostic.status === "success" && diagnostic.characterCount > 0,
  ).length;
}

function formatControlLabel(value: string) {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
