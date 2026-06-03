"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { reopenFinalSubmissionAction } from "../../../../actions";

const reasonMaxLength = 1000;

type ReopenFinalSubmissionFormProps = {
  classId: string;
  slotId: string;
};

export function ReopenFinalSubmissionForm({
  classId,
  slotId,
}: ReopenFinalSubmissionFormProps) {
  const [reason, setReason] = useState("");
  const [state, formAction, isPending] = useActionState(
    reopenFinalSubmissionAction,
    {},
  );

  return (
    <form action={formAction} className="grid content-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3">
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="slotId" value={slotId} />
      <div>
        <p className="text-sm font-semibold text-amber-950">
          Reopen final submission
        </p>
        <p className="mt-1 text-xs text-amber-900">
          Use this only when the final-submitted criterion needs a corrected upload. The reason is sent to the student.
        </p>
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`reopen-reason-${slotId}`}>Reason</Label>
        <textarea
          id={`reopen-reason-${slotId}`}
          name="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={5}
          maxLength={reasonMaxLength}
          className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Explain what the student needs to fix or re-upload."
        />
        <p className="text-xs text-amber-900">
          {reason.length}/{reasonMaxLength} characters
        </p>
      </div>
      {state.success ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.success}
        </p>
      ) : null}
      {state.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button
        type="submit"
        size="sm"
        disabled={isPending || reason.trim().length < 5}
      >
        {isPending ? "Reopening..." : "Reopen for revision"}
      </Button>
    </form>
  );
}
