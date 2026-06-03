"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { updateSubmissionSlotAction } from "../../actions";

type SubmissionFormProps = {
  classId: string;
  slotId: string;
  canEdit: boolean;
  defaultNotes: string;
  submittedLabel: string;
  criterionCode: string;
  maxUploadSizeLabel: string;
  isRevisionNeeded: boolean;
  latestVersionNumber?: number | null;
};

export function SubmissionForm({
  classId,
  slotId,
  canEdit,
  defaultNotes,
  submittedLabel,
  criterionCode,
  maxUploadSizeLabel,
  isRevisionNeeded,
  latestVersionNumber,
}: SubmissionFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateSubmissionSlotAction,
    {},
  );

  return (
    <form action={canEdit ? formAction : undefined} className="grid gap-4">
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="slotId" value={slotId} />

      <div className="grid gap-2">
        <Label htmlFor={`artifactFile-${slotId}`}>Upload PDF or DOCX</Label>
        <Input
          id={`artifactFile-${slotId}`}
          name="artifactFile"
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={!canEdit || isPending}
        />
        <p className="text-xs text-muted-foreground">
          Maximum file size: {maxUploadSizeLabel}. Uploading a file creates a new submitted version.
          {isRevisionNeeded
            ? " After upload, the status will return to Submitted for teacher review."
            : ""}
        </p>
        <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          Use a text-based PDF or DOCX when possible. Scanned image-only PDFs may
          open visually but cannot be read reliably by AI review.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`notes-${slotId}`}>
          {isRevisionNeeded ? "What changed in this revision?" : "Note to teacher"}
        </Label>
        <textarea
          id={`notes-${slotId}`}
          name="notes"
          defaultValue={defaultNotes}
          rows={4}
          className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder={
            isRevisionNeeded
              ? "Example: I clarified the success criteria and added measurable requirements."
              : "Tell your teacher what changed or what to review."
          }
          disabled={!canEdit || isPending}
        />
        <p className="text-xs text-muted-foreground">
          {isRevisionNeeded
            ? "This note will be saved with the new version so your teacher can compare it with the previous feedback."
            : "This note is saved with the uploaded version history."}
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{submittedLabel}</p>
        {canEdit ? (
          <Button type="submit" disabled={isPending}>
            {isPending
              ? "Uploading..."
              : isRevisionNeeded
                ? `Submit revision v${(latestVersionNumber ?? 0) + 1}`
                : `Submit Criterion ${criterionCode}`}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Teacher review is in progress.
          </p>
        )}
      </div>
    </form>
  );
}
