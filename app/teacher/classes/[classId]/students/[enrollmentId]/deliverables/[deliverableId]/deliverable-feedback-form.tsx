"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import type { SubmissionStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatSubmissionStatus, teacherReviewStatuses } from "@/lib/submissions";

import { updateDeliverableTeacherFeedbackAction } from "../../../../actions";

const teacherFeedbackMaxLength = 8000;

type DeliverableFeedbackFormProps = {
  classId: string;
  deliverableSlotId: string;
  currentStatus: SubmissionStatus;
  feedback: string;
  queueHref: string;
  studentHref: string;
  latestVersionLabel?: string;
  latestSubmittedLabel?: string;
  reviewedLabel?: string | null;
};

export function DeliverableFeedbackForm({
  classId,
  deliverableSlotId,
  currentStatus,
  feedback,
  queueHref,
  studentHref,
  latestVersionLabel,
  latestSubmittedLabel,
  reviewedLabel,
}: DeliverableFeedbackFormProps) {
  const [feedbackDraft, setFeedbackDraft] = useState(feedback);
  const [selectedStatus, setSelectedStatus] = useState(
    (teacherReviewStatuses as readonly string[]).includes(currentStatus)
      ? currentStatus
      : "under_review",
  );
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [state, formAction, isPending] = useActionState(
    updateDeliverableTeacherFeedbackAction,
    {},
  );

  useEffect(() => {
    if (state.success === "Feedback sent to the student.") {
      const timeoutId = window.setTimeout(() => {
        setFeedbackDraft("");
        setCopyNotice("Feedback was sent. The draft box is ready for new notes.");
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, [state.success]);

  return (
    <form action={formAction} className="grid content-start gap-4 rounded-md border bg-card p-4">
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="deliverableSlotId" value={deliverableSlotId} />

      <div className="flex items-start justify-between gap-3 border-b pb-3">
        <div>
          <p className="text-lg font-semibold tracking-normal">Review decision</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Set this deliverable status and send feedback when needed.
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 rounded-md border px-2 py-1 text-xs font-semibold ${getStatusTone(currentStatus)}`}
        >
          {formatSubmissionStatus(currentStatus)}
        </span>
      </div>

      {latestVersionLabel ? (
        <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
          <p className="font-medium">{latestVersionLabel}</p>
          {latestSubmittedLabel ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {latestSubmittedLabel}
            </p>
          ) : null}
          {reviewedLabel ? (
            <p className="mt-1 text-xs text-muted-foreground">{reviewedLabel}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-1">
        <Label htmlFor={`deliverable-status-${deliverableSlotId}`}>Review status</Label>
        <select
          id={`deliverable-status-${deliverableSlotId}`}
          name="status"
          value={selectedStatus}
          onChange={(event) =>
            setSelectedStatus(event.target.value as SubmissionStatus)
          }
          className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {teacherReviewStatuses.map((status) => (
            <option key={status} value={status}>
              {formatSubmissionStatus(status)}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {isStudentVisibleStatus(selectedStatus)
            ? "Saving with this status sends feedback to the student."
            : "Saving with this status keeps feedback as a teacher draft."}
        </p>
      </div>

      <div className="grid gap-1">
        <Label htmlFor={`deliverable-feedback-${deliverableSlotId}`}>Feedback</Label>
        <textarea
          id={`deliverable-feedback-${deliverableSlotId}`}
          name="teacherFeedback"
          value={feedbackDraft}
          onChange={(event) => setFeedbackDraft(event.target.value)}
          rows={7}
          maxLength={teacherFeedbackMaxLength}
          className="min-h-36 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Write feedback for this deliverable."
        />
        <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{copyNotice ?? "Use concise, student-facing feedback for this deliverable."}</p>
          <p
            className={
              feedbackDraft.length > teacherFeedbackMaxLength - 250
                ? "text-amber-700"
                : ""
            }
          >
            {feedbackDraft.length}/{teacherFeedbackMaxLength} characters
          </p>
        </div>
      </div>

      {state.success ? (
        <div className="grid gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <p>{state.success}</p>
          <div className="flex flex-wrap gap-3">
            <Link href={studentHref} className="font-medium underline-offset-4 hover:underline">
              Back to student
            </Link>
            <Link href={queueHref} className="font-medium underline-offset-4 hover:underline">
              Back to class
            </Link>
          </div>
        </div>
      ) : null}
      {state.error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="sm" disabled={isPending}>
        {isPending
          ? "Saving..."
          : isStudentVisibleStatus(selectedStatus)
            ? "Send feedback"
            : "Save draft"}
      </Button>
    </form>
  );
}

function isStudentVisibleStatus(status: SubmissionStatus) {
  return status === "revision_needed" || status === "passed";
}

function getStatusTone(status: SubmissionStatus) {
  switch (status) {
    case "passed":
    case "final_submitted":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "submitted":
    case "under_review":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "revision_needed":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "locked":
      return "border-stone-200 bg-stone-50 text-stone-700";
    case "draft":
      return "border-zinc-200 bg-zinc-50 text-zinc-700";
    case "not_started":
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}
