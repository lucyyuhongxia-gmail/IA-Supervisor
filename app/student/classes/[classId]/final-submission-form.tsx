"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";

import {
  finalizeClassSubmissionAction,
  type StudentSubmissionState,
} from "./actions";

type FinalSubmissionFormProps = {
  classId: string;
  canFinalize: boolean;
  isFinalSubmitted: boolean;
};

const initialState: StudentSubmissionState = {};

export function FinalSubmissionForm({
  classId,
  canFinalize,
  isFinalSubmitted,
}: FinalSubmissionFormProps) {
  const [state, formAction, isPending] = useActionState(
    finalizeClassSubmissionAction,
    initialState,
  );

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="classId" value={classId} />
      {state.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {state.success}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={!canFinalize || isFinalSubmitted || isPending}
      >
        {isPending
          ? "Finalizing..."
          : isFinalSubmitted
            ? "Final submitted"
            : "Finalize IA submission"}
      </Button>
    </form>
  );
}
