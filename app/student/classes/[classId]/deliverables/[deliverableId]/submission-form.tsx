"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { updateDeliverableSubmissionSlotAction } from "../../actions";

type DeliverableSubmissionFormProps = {
  classId: string;
  deliverableSlotId: string;
  canEdit: boolean;
  defaultArtifactUrl: string;
  defaultNotes: string;
  submittedLabel: string;
  deliverableTitle: string;
  maxUploadSizeLabel: string;
  allowsLink: boolean;
  requiresPdf: boolean;
  isRevisionNeeded: boolean;
  latestVersionNumber?: number | null;
  lockedMessage: string;
};

export function DeliverableSubmissionForm({
  classId,
  deliverableSlotId,
  canEdit,
  defaultArtifactUrl,
  defaultNotes,
  submittedLabel,
  deliverableTitle,
  maxUploadSizeLabel,
  allowsLink,
  requiresPdf,
  isRevisionNeeded,
  latestVersionNumber,
  lockedMessage,
}: DeliverableSubmissionFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(
    updateDeliverableSubmissionSlotAction,
    {},
  );
  const deliverableSubmitted = state.success === "Deliverable submitted.";

  useEffect(() => {
    if (!deliverableSubmitted) {
      return;
    }

    formRef.current?.reset();
    router.refresh();
  }, [deliverableSubmitted, router]);

  return (
    <form
      ref={formRef}
      action={canEdit ? formAction : undefined}
      className="grid gap-4"
    >
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="deliverableSlotId" value={deliverableSlotId} />

      {requiresPdf ? (
        <div className="grid gap-2">
          <Label htmlFor={`artifactFile-${deliverableSlotId}`}>Upload PDF</Label>
          <Input
            id={`artifactFile-${deliverableSlotId}`}
            name="artifactFile"
            type="file"
            accept=".pdf,application/pdf"
            disabled={!canEdit || isPending}
          />
          <p className="text-xs text-muted-foreground">
            Maximum file size: {maxUploadSizeLabel}. Uploading creates a new
            submitted version.
          </p>
          <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
            Submit a text-based PDF. Scanned image-only PDFs cannot be read
            reliably by AI review.
          </p>
        </div>
      ) : null}

      {allowsLink ? (
        <div className="grid gap-2">
          <Label htmlFor={`artifactUrl-${deliverableSlotId}`}>
            Video or evidence link
          </Label>
          <Input
            id={`artifactUrl-${deliverableSlotId}`}
            name="artifactUrl"
            type="url"
            defaultValue={defaultArtifactUrl}
            placeholder="https://..."
            disabled={!canEdit || isPending}
          />
          <p className="text-xs text-muted-foreground">
            Use a stable school-approved link that your teacher can open.
          </p>
        </div>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor={`notes-${deliverableSlotId}`}>
          {isRevisionNeeded ? "What changed in this revision?" : "Note to teacher"}
        </Label>
        <textarea
          id={`notes-${deliverableSlotId}`}
          name="notes"
          defaultValue={defaultNotes}
          rows={4}
          className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder={
            isRevisionNeeded
              ? "Example: I revised the evidence after teacher feedback."
              : "Tell your teacher what to review in this deliverable."
          }
          disabled={!canEdit || isPending}
        />
      </div>

      {state.success ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <p className="font-medium">Submitted for teacher review.</p>
          <p className="mt-1 text-xs">
            The page is refreshing to show the latest deliverable status.
          </p>
        </div>
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
              ? "Submitting..."
              : isRevisionNeeded
                ? `Submit revision v${(latestVersionNumber ?? 0) + 1}`
                : `Submit ${deliverableTitle}`}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            {lockedMessage}
          </p>
        )}
      </div>
    </form>
  );
}
