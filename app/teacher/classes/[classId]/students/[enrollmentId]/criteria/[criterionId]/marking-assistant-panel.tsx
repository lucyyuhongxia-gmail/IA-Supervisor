"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import {
  runMarkingAssistantAction,
  saveFinalMarkAction,
  type FinalMarkState,
  type MarkingAssistantState,
} from "../../../../actions";

type MarkingAssistantPanelProps = {
  classId: string;
  slotId: string;
  disabled: boolean;
  maxMarks: number;
  snapshot: {
    id: string;
    suggestedMarkMin: number;
    suggestedMarkMax: number;
    suggestedSingleMark: number | null;
    confidence: string;
    rationale: string;
    createdAtLabel: string;
    requestedByName: string;
    descriptorEvidenceJson: unknown;
    teacherFinalMark: number | null;
    teacherFinalComment: string | null;
    finalMarkedAtLabel: string | null;
  } | null;
};

const initialState: MarkingAssistantState = {};
const finalMarkInitialState: FinalMarkState = {};

export function MarkingAssistantPanel({
  classId,
  slotId,
  disabled,
  maxMarks,
  snapshot,
}: MarkingAssistantPanelProps) {
  const [state, formAction, pending] = useActionState(
    runMarkingAssistantAction,
    initialState,
  );
  const [finalMarkState, finalMarkAction, finalMarkPending] = useActionState(
    saveFinalMarkAction,
    finalMarkInitialState,
  );
  const descriptorEvidence = getDescriptorEvidence(
    snapshot?.descriptorEvidenceJson,
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-lg">Marking assistant</CardTitle>
            <CardDescription>
              Conservative advisory range. Teacher final mark remains final.
            </CardDescription>
          </div>
          <form action={formAction}>
            <input type="hidden" name="classId" value={classId} />
            <input type="hidden" name="slotId" value={slotId} />
            <Button type="submit" size="sm" disabled={disabled || pending}>
              {pending ? "Running..." : snapshot ? "Rerun" : "Run"}
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

        {snapshot ? (
          <>
            <div className="rounded-md border p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">
                Suggested range
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-normal">
                {snapshot.suggestedMarkMin}-{snapshot.suggestedMarkMax}
                <span className="ml-1 text-base font-normal text-muted-foreground">
                  / {maxMarks}
                </span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Suggested single mark:{" "}
                {snapshot.suggestedSingleMark ?? "not available"} ·{" "}
                {snapshot.confidence} confidence
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Generated {snapshot.createdAtLabel} by {snapshot.requestedByName}
              </p>
            </div>

            <div className="rounded-md border p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium">Teacher final mark</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Stored separately from the assistant suggestion. Not shown to students yet.
                  </p>
                </div>
                {snapshot.teacherFinalMark !== null ? (
                  <span className="inline-flex w-fit rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                    Saved
                  </span>
                ) : null}
              </div>
              {snapshot.teacherFinalMark !== null ? (
                <div className="mt-3 rounded-md bg-muted p-3">
                  <p className="text-2xl font-semibold tracking-normal">
                    {snapshot.teacherFinalMark}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      / {maxMarks}
                    </span>
                  </p>
                  {snapshot.teacherFinalComment ? (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {snapshot.teacherFinalComment}
                    </p>
                  ) : null}
                  {snapshot.finalMarkedAtLabel ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Saved {snapshot.finalMarkedAtLabel}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <form action={finalMarkAction} className="mt-3 grid gap-3">
                <input type="hidden" name="classId" value={classId} />
                <input type="hidden" name="markingSnapshotId" value={snapshot.id} />
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Final mark</span>
                  <input
                    name="teacherFinalMark"
                    type="number"
                    min={0}
                    max={maxMarks}
                    defaultValue={
                      snapshot.teacherFinalMark ??
                      snapshot.suggestedSingleMark ??
                      snapshot.suggestedMarkMin
                    }
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Final comment</span>
                  <textarea
                    name="teacherFinalComment"
                    rows={4}
                    maxLength={4000}
                    defaultValue={snapshot.teacherFinalComment ?? ""}
                    className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Optional final marking note for teacher records."
                  />
                </label>
                {finalMarkState.error ? (
                  <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {finalMarkState.error}
                  </p>
                ) : null}
                {finalMarkState.success ? (
                  <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    {finalMarkState.success}
                  </p>
                ) : null}
                <Button type="submit" size="sm" disabled={finalMarkPending}>
                  {finalMarkPending ? "Saving..." : "Save final mark"}
                </Button>
              </form>
            </div>

            <div className="rounded-md border p-3">
              <p className="text-sm font-medium">Rationale</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {snapshot.rationale}
              </p>
            </div>

            {descriptorEvidence.length > 0 ? (
              <div className="grid gap-2">
                {descriptorEvidence.map((item) => (
                  <div key={item.section} className="rounded-md border p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-medium">{item.section}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.note}
                        </p>
                      </div>
                      <span className={`inline-flex w-fit rounded-md border px-2 py-1 text-xs font-semibold ${getEvidenceTone(item.status)}`}>
                        {formatStatus(item.status)}
                      </span>
                    </div>
                    {item.evidence.length > 0 ? (
                      <div className="mt-3 grid gap-2">
                        {item.evidence.map((snippet, index) => (
                          <blockquote
                            key={`${item.section}-${index}`}
                            className="border-l-2 pl-3 text-xs text-muted-foreground"
                          >
                            {snippet}
                          </blockquote>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p className="rounded-md border p-3 text-sm text-muted-foreground">
            Run marking assistant after semantic extraction exists for the latest submitted version.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function getDescriptorEvidence(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const section =
        typeof record.section === "string" ? record.section : "Descriptor";
      const status = typeof record.status === "string" ? record.status : "missing";
      const note = typeof record.note === "string" ? record.note : "";
      const evidence = Array.isArray(record.evidence)
        ? record.evidence.filter((snippet): snippet is string => typeof snippet === "string")
        : [];

      return { section, status, note, evidence };
    })
    .filter(
      (item): item is {
        section: string;
        status: string;
        note: string;
        evidence: string[];
      } => Boolean(item),
    );
}

function formatStatus(value: string) {
  return value
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function getEvidenceTone(status: string) {
  switch (status) {
    case "met":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "partial":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "missing":
    case "not_evidenced":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}
