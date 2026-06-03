"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { runDeltaReviewAction, type DeltaReviewState } from "../../../../actions";

type DeltaReviewPanelProps = {
  classId: string;
  slotId: string;
  disabled: boolean;
  versionCount: number;
  review: {
    id: string;
    summary: string;
    confidence: string;
    createdAtLabel: string;
    requestedByName: string | null;
    previousVersionNumber: number | null;
    currentVersionNumber: number | null;
    resolvedJson: unknown;
    remainingJson: unknown;
    newEvidenceJson: unknown;
  } | null;
};

type DeltaReviewItem = {
  issue: string;
  status: string;
  evidence: string[];
  teacherAction: string;
};

type NewEvidenceItem = {
  label: string;
  evidence: string;
  teacherAction: string;
};

const initialState: DeltaReviewState = {};

export function DeltaReviewPanel({
  classId,
  slotId,
  disabled,
  versionCount,
  review,
}: DeltaReviewPanelProps) {
  const [state, formAction, pending] = useActionState(
    runDeltaReviewAction,
    initialState,
  );
  const resolved = getDeltaReviewItems(review?.resolvedJson);
  const remaining = getDeltaReviewItems(review?.remainingJson);
  const newEvidence = getNewEvidenceItems(review?.newEvidenceJson);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-lg">Delta review</CardTitle>
            <CardDescription>
              Compares the latest version with the previous teacher feedback.
            </CardDescription>
          </div>
          {review ? (
            <span className={`inline-flex w-fit rounded-md border px-2 py-1 text-xs font-semibold ${getConfidenceTone(review.confidence)}`}>
              {review.confidence} confidence
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form action={formAction} className="grid gap-3">
          <input type="hidden" name="classId" value={classId} />
          <input type="hidden" name="slotId" value={slotId} />
          <Button type="submit" variant="outline" disabled={disabled || pending}>
            {pending ? "Comparing versions..." : review ? "Rerun delta review" : "Run delta review"}
          </Button>
          {disabled ? (
            <p className="text-xs text-muted-foreground">
              Delta review needs at least two submitted versions and feedback on the previous version.
              Current version count: {versionCount}.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              This is teacher-facing only. Verify all evidence before using it in feedback.
            </p>
          )}
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
        </form>

        {review ? (
          <div className="grid gap-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">
                v{review.previousVersionNumber ?? "?"} → v{review.currentVersionNumber ?? "?"}
              </p>
              <p className="mt-1 text-muted-foreground">{review.summary}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Ran {review.createdAtLabel}
                {review.requestedByName ? ` by ${review.requestedByName}` : ""}
              </p>
            </div>

            <DeltaReviewSection
              title="Possibly addressed"
              emptyText="No previous feedback item has clear response evidence yet."
              items={resolved}
              tone="emerald"
            />
            <DeltaReviewSection
              title="Still needs teacher review"
              emptyText="No remaining issue was detected from the previous feedback."
              items={remaining}
              tone="amber"
            />

            <div className="grid gap-2">
              <p className="text-sm font-medium">New or changed evidence</p>
              {newEvidence.length > 0 ? (
                newEvidence.map((item, index) => (
                  <div key={`${item.label}-${index}`} className="rounded-md border p-3 text-sm">
                    <p className="font-medium">{item.label}</p>
                    <blockquote className="mt-2 border-l-2 pl-3 text-muted-foreground">
                      {item.evidence}
                    </blockquote>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {item.teacherAction}
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-md border p-3 text-sm text-muted-foreground">
                  No clear new evidence detected. Check the latest file manually.
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="rounded-md border p-3 text-sm text-muted-foreground">
            No delta review has been run for this criterion yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function DeltaReviewSection({
  title,
  emptyText,
  items,
  tone,
}: {
  title: string;
  emptyText: string;
  items: DeltaReviewItem[];
  tone: "emerald" | "amber";
}) {
  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium">{title}</p>
      {items.length > 0 ? (
        items.map((item, index) => (
          <div key={`${item.issue}-${index}`} className={`rounded-md border p-3 text-sm ${getItemTone(tone)}`}>
            <p className="font-medium">{item.issue}</p>
            {item.evidence.length > 0 ? (
              <div className="mt-2 grid gap-2">
                {item.evidence.map((snippet, snippetIndex) => (
                  <blockquote
                    key={`${item.issue}-${snippetIndex}`}
                    className="border-l-2 pl-3"
                  >
                    {snippet}
                  </blockquote>
                ))}
              </div>
            ) : null}
            <p className="mt-2 text-xs">{item.teacherAction}</p>
          </div>
        ))
      ) : (
        <p className="rounded-md border p-3 text-sm text-muted-foreground">
          {emptyText}
        </p>
      )}
    </div>
  );
}

function getDeltaReviewItems(value: unknown): DeltaReviewItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const issue = typeof record.issue === "string" ? record.issue : "";
      const status = typeof record.status === "string" ? record.status : "";
      const teacherAction =
        typeof record.teacherAction === "string" ? record.teacherAction : "";
      const evidence = Array.isArray(record.evidence)
        ? record.evidence.filter((entry): entry is string => typeof entry === "string")
        : [];

      return issue ? { issue, status, evidence, teacherAction } : null;
    })
    .filter((item): item is DeltaReviewItem => Boolean(item));
}

function getNewEvidenceItems(value: unknown): NewEvidenceItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label : "";
      const evidence = typeof record.evidence === "string" ? record.evidence : "";
      const teacherAction =
        typeof record.teacherAction === "string" ? record.teacherAction : "";

      return label && evidence ? { label, evidence, teacherAction } : null;
    })
    .filter((item): item is NewEvidenceItem => Boolean(item));
}

function getConfidenceTone(confidence: string) {
  switch (confidence) {
    case "medium":
    case "high":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "low":
    default:
      return "border-amber-200 bg-amber-50 text-amber-800";
  }
}

function getItemTone(tone: "emerald" | "amber") {
  return tone === "emerald"
    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
    : "border-amber-200 bg-amber-50 text-amber-950";
}
