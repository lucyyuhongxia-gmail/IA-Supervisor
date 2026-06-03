"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import {
  runConsistencyReviewAction,
  type ConsistencyReviewState,
} from "../../actions";

type ConsistencyReviewPanelProps = {
  classId: string;
  enrollmentId: string;
  checks: Array<{
    id: string;
    checkType: string;
    status: string;
    severity: string;
    summary: string;
    createdAtLabel: string;
    evidenceJson: unknown;
    sourceCriterionCode: string | null;
    targetCriterionCode: string | null;
    requestedByName: string;
  }>;
};

const initialState: ConsistencyReviewState = {};

export function ConsistencyReviewPanel({
  classId,
  enrollmentId,
  checks,
}: ConsistencyReviewPanelProps) {
  const [state, formAction, pending] = useActionState(
    runConsistencyReviewAction,
    initialState,
  );
  const latestRunLabel = checks[0]?.createdAtLabel;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-lg">Cross-criterion consistency</CardTitle>
            <CardDescription>
              Checks whether the IA evidence connects across criteria A-E.
            </CardDescription>
          </div>
          <form action={formAction}>
            <input type="hidden" name="classId" value={classId} />
            <input type="hidden" name="enrollmentId" value={enrollmentId} />
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Running..." : checks.length > 0 ? "Run again" : "Run consistency review"}
            </Button>
          </form>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {state.error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {state.success}
          </p>
        ) : null}

        {checks.length > 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              Latest run {latestRunLabel} · {checks.length} checks
            </p>
            <div className="grid gap-3">
              {checks.map((check) => {
                const evidence = getEvidence(check.evidenceJson);

                return (
                  <div key={check.id} className="rounded-md border p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          {formatCheckType(check.checkType)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {check.sourceCriterionCode ?? "Source"} →{" "}
                          {check.targetCriterionCode ?? "Target"} · requested by{" "}
                          {check.requestedByName}
                        </p>
                      </div>
                      <span className={`inline-flex w-fit rounded-md border px-2 py-1 text-xs font-semibold ${getStatusTone(check.status, check.severity)}`}>
                        {formatStatus(check.status)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {check.summary}
                    </p>
                    {evidence.overlappingKeywords.length > 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Shared terms: {evidence.overlappingKeywords.join(", ")}
                      </p>
                    ) : null}
                    <details className="mt-3 rounded-md border bg-muted/30 px-3 py-2">
                      <summary className="cursor-pointer text-xs font-medium">
                        Evidence snippets
                      </summary>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <EvidenceColumn
                          title={`${evidence.sourceCriterion ?? "Source"} evidence`}
                          sections={evidence.sourceSections}
                        />
                        <EvidenceColumn
                          title={`${evidence.targetCriterion ?? "Target"} evidence`}
                          sections={evidence.targetSections}
                        />
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <p className="rounded-md border p-3 text-sm text-muted-foreground">
            No consistency review has been run for this student yet. Generate semantic extraction for submitted criteria first for better results.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function EvidenceColumn({
  title,
  sections,
}: {
  title: string;
  sections: Array<{ label: string; snippets: string[] }>;
}) {
  return (
    <div className="grid content-start gap-2">
      <p className="text-xs font-medium">{title}</p>
      {sections.length > 0 ? (
        sections.map((section) => (
          <div key={section.label} className="rounded-md bg-background p-2">
            <p className="text-xs font-medium text-muted-foreground">
              {section.label}
            </p>
            {section.snippets.length > 0 ? (
              <div className="mt-2 grid gap-2">
                {section.snippets.map((snippet, index) => (
                  <blockquote
                    key={`${section.label}-${index}`}
                    className="border-l-2 pl-2 text-xs text-muted-foreground"
                  >
                    {snippet}
                  </blockquote>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                No snippet extracted.
              </p>
            )}
          </div>
        ))
      ) : (
        <p className="text-xs text-muted-foreground">No evidence extracted.</p>
      )}
    </div>
  );
}

function getEvidence(value: unknown) {
  const fallback = {
    sourceCriterion: null as string | null,
    targetCriterion: null as string | null,
    sourceSections: [] as Array<{ label: string; snippets: string[] }>,
    targetSections: [] as Array<{ label: string; snippets: string[] }>,
    overlappingKeywords: [] as string[],
  };

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  const record = value as Record<string, unknown>;

  return {
    sourceCriterion:
      typeof record.sourceCriterion === "string" ? record.sourceCriterion : null,
    targetCriterion:
      typeof record.targetCriterion === "string" ? record.targetCriterion : null,
    sourceSections: getEvidenceSections(record.sourceSections),
    targetSections: getEvidenceSections(record.targetSections),
    overlappingKeywords: Array.isArray(record.overlappingKeywords)
      ? record.overlappingKeywords.filter(
          (keyword): keyword is string => typeof keyword === "string",
        )
      : [],
  };
}

function getEvidenceSections(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label : "Evidence";
      const snippets = Array.isArray(record.snippets)
        ? record.snippets.filter((snippet): snippet is string => typeof snippet === "string")
        : [];

      return { label, snippets };
    })
    .filter((item): item is { label: string; snippets: string[] } =>
      Boolean(item),
    );
}

function formatCheckType(value: string) {
  switch (value) {
    case "A_C_success_criteria_testing_alignment":
      return "A → C success criteria testing";
    case "A_E_success_criteria_evaluation_alignment":
      return "A → E success criteria evaluation";
    case "B_D_plan_development_alignment":
      return "B → D planning to development";
    case "C_D_algorithm_implementation_alignment":
      return "C → D design to implementation";
    default:
      return value.split("_").join(" ");
  }
}

function formatStatus(value: string) {
  return value
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusTone(status: string, severity: string) {
  if (status === "met") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (severity === "critical" || status === "missing") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (severity === "warning" || status === "partial") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}
