"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import {
  confirmSemanticExtractionAction,
  generateSemanticExtractionAction,
  type SemanticExtractionState,
} from "../../../../actions";

type SemanticExtractionPanelProps = {
  classId: string;
  slotId: string;
  disabled: boolean;
  extraction: {
    id: string;
    status: string;
    confidence: string | null;
    sourceCharacterCount: number;
    message: string | null;
    createdAtLabel: string;
    confirmedAtLabel: string | null;
    confirmedByName: string | null;
    extractedJson: unknown;
  } | null;
};

const initialState: SemanticExtractionState = {};

export function SemanticExtractionPanel({
  classId,
  slotId,
  disabled,
  extraction,
}: SemanticExtractionPanelProps) {
  const [generateState, generateAction, isGenerating] = useActionState(
    generateSemanticExtractionAction,
    initialState,
  );
  const [confirmState, confirmAction, isConfirming] = useActionState(
    confirmSemanticExtractionAction,
    initialState,
  );
  const sections = getSemanticSections(extraction?.extractedJson);
  const canConfirm =
    extraction &&
    extraction.status === "generated" &&
    extraction.sourceCharacterCount > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-lg">Semantic extraction</CardTitle>
            <CardDescription>
              Structured IA elements extracted from the latest submitted version.
            </CardDescription>
          </div>
          {extraction ? (
            <span className={`inline-flex w-fit rounded-md border px-2 py-1 text-xs font-semibold ${getStatusTone(extraction.status)}`}>
              {formatExtractionStatus(extraction.status)}
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            {extraction ? (
              <>
                <p>
                  Generated {extraction.createdAtLabel} ·{" "}
                  {extraction.sourceCharacterCount.toLocaleString()} chars
                  {extraction.confidence ? ` · ${extraction.confidence} confidence` : ""}
                </p>
                {extraction.confirmedAtLabel ? (
                  <p>
                    Confirmed {extraction.confirmedAtLabel}
                    {extraction.confirmedByName ? ` by ${extraction.confirmedByName}` : ""}
                  </p>
                ) : null}
              </>
            ) : (
              <p>No semantic extraction has been generated for the latest version.</p>
            )}
          </div>
          <form action={generateAction}>
            <input type="hidden" name="classId" value={classId} />
            <input type="hidden" name="slotId" value={slotId} />
            <Button type="submit" variant="outline" size="sm" disabled={disabled || isGenerating}>
              {isGenerating
                ? "Generating..."
                : extraction
                  ? "Regenerate"
                  : "Generate"}
            </Button>
          </form>
        </div>

        {generateState.error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {generateState.error}
          </p>
        ) : null}
        {generateState.success ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {generateState.success}
          </p>
        ) : null}

        {extraction?.message ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {extraction.message}
          </p>
        ) : null}

        {sections.length > 0 ? (
          <div className="grid gap-3">
            {sections.map((section) => (
              <div key={section.key} className="rounded-md border p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">{section.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {section.description}
                    </p>
                  </div>
                  <span className={`inline-flex w-fit rounded-md border px-2 py-1 text-xs font-semibold ${getSectionTone(section.status)}`}>
                    {formatSectionStatus(section.status)}
                  </span>
                </div>
                {section.snippets.length > 0 ? (
                  <div className="mt-3 grid gap-2">
                    {section.snippets.map((snippet, index) => (
                      <blockquote
                        key={`${section.key}-${index}`}
                        className="border-l-2 pl-3 text-xs text-muted-foreground"
                      >
                        {snippet}
                      </blockquote>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    No strong snippet found. Teacher should verify manually.
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {extraction ? (
          <form action={confirmAction} className="grid gap-2">
            <input type="hidden" name="classId" value={classId} />
            <input type="hidden" name="slotId" value={slotId} />
            <input type="hidden" name="extractionId" value={extraction.id} />
            <Button type="submit" size="sm" disabled={!canConfirm || isConfirming}>
              {isConfirming ? "Confirming..." : "Confirm extraction"}
            </Button>
            {!canConfirm ? (
              <p className="text-xs text-muted-foreground">
                Confirmation is available only for generated extractions with readable text.
              </p>
            ) : null}
            {confirmState.error ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {confirmState.error}
              </p>
            ) : null}
            {confirmState.success ? (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {confirmState.success}
              </p>
            ) : null}
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

function getSemanticSections(value: unknown) {
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
      const description =
        typeof record.description === "string" ? record.description : "";
      const status =
        typeof record.status === "string" ? record.status : "not_found";
      const snippets = Array.isArray(record.snippets)
        ? record.snippets.filter((item): item is string => typeof item === "string")
        : [];

      if (!key) {
        return null;
      }

      return { key, label, description, status, snippets };
    })
    .filter((section): section is NonNullable<typeof section> => Boolean(section));
}

function formatExtractionStatus(status: string) {
  switch (status) {
    case "teacher_confirmed":
      return "Teacher confirmed";
    case "student_confirmed":
      return "Student confirmed";
    case "failed":
      return "Failed";
    case "generated":
    default:
      return "Generated";
  }
}

function getStatusTone(status: string) {
  switch (status) {
    case "teacher_confirmed":
    case "student_confirmed":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "failed":
      return "border-red-200 bg-red-50 text-red-700";
    case "generated":
    default:
      return "border-blue-200 bg-blue-50 text-blue-800";
  }
}

function formatSectionStatus(status: string) {
  switch (status) {
    case "found":
      return "Found";
    case "limited":
      return "Limited";
    case "not_found":
    default:
      return "Not found";
  }
}

function getSectionTone(status: string) {
  switch (status) {
    case "found":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "limited":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "not_found":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}
