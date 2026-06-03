"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import { runAIReviewAction, type AIReviewState } from "../../../../actions";

type AIReviewFormProps = {
  classId: string;
  slotId: string;
  disabled: boolean;
  aiReviewState: "missing" | "current" | "stale" | "failed" | "pending";
};

const initialState: AIReviewState = {};

export function AIReviewForm({
  classId,
  slotId,
  disabled,
  aiReviewState,
}: AIReviewFormProps) {
  const [state, formAction, pending] = useActionState(
    runAIReviewAction,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-3 rounded-md border p-3">
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="slotId" value={slotId} />
      <div>
        <p className="text-sm font-medium">AI review assistant</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Generates draft review notes for the teacher. It does not change status
          or assign a final mark.
        </p>
      </div>
      {!disabled ? (
        <p className={`rounded-md border px-3 py-2 text-xs ${getAIReviewPromptTone(aiReviewState)}`}>
          {getAIReviewPrompt(aiReviewState)}
        </p>
      ) : null}
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
      <Button type="submit" disabled={disabled || pending}>
        {pending ? "Running AI review..." : getAIReviewButtonLabel(aiReviewState)}
      </Button>
      {disabled ? (
        <p className="text-xs text-muted-foreground">
          A submitted version is required before AI review can run.
        </p>
      ) : null}
    </form>
  );
}

function getAIReviewButtonLabel(state: AIReviewFormProps["aiReviewState"]) {
  switch (state) {
    case "current":
      return "Rerun AI review";
    case "stale":
      return "Run AI review for latest version";
    case "failed":
      return "Retry AI review";
    case "pending":
      return "Run again";
    case "missing":
    default:
      return "Run AI review";
  }
}

function getAIReviewPrompt(state: AIReviewFormProps["aiReviewState"]) {
  switch (state) {
    case "current":
      return "AI review is current for the latest submitted version. Rerun only if files or reference guidance changed.";
    case "stale":
      return "The student submitted a newer version after the last AI review. Rerun before relying on AI notes.";
    case "failed":
      return "The last AI review failed. Retry after checking that the uploaded file has extractable text.";
    case "pending":
      return "An AI review run is pending or incomplete. Run again if it does not finish.";
    case "missing":
    default:
      return "No AI review exists for this submitted version yet.";
  }
}

function getAIReviewPromptTone(state: AIReviewFormProps["aiReviewState"]) {
  switch (state) {
    case "current":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "stale":
    case "failed":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "pending":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "missing":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}
