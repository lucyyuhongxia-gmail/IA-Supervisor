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
  studentHref: string;
  classHref: string;
  reviewQueueHref: string;
  nextReviewHref?: string;
  latestVersionLabel?: string;
  latestSubmittedLabel?: string;
  reviewedLabel?: string | null;
};

export function DeliverableFeedbackForm({
  classId,
  deliverableSlotId,
  currentStatus,
  feedback,
  studentHref,
  classHref,
  reviewQueueHref,
  nextReviewHref,
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
  const isStudentVisible = isStudentVisibleStatus(selectedStatus);
  const saveActionLabel = isStudentVisible ? "Send feedback" : "Save teacher draft";
  const statusHelp = getStatusHelpText(selectedStatus);

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
            Decide what the student sees. Draft statuses stay teacher-only.
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
        <div
          className={`rounded-md border px-3 py-2 text-xs ${
            isStudentVisible
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-blue-200 bg-blue-50 text-blue-900"
          }`}
        >
          <p className="font-semibold">
            {isStudentVisible ? "Student-visible send" : "Teacher-only draft"}
          </p>
          <p className="mt-1">{statusHelp}</p>
        </div>
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
        <div className="grid gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
          <div>
            <p className="font-semibold">
              {state.success === "Feedback sent to the student."
                ? "Feedback sent"
                : "Teacher draft saved"}
            </p>
            <p className="mt-1 text-xs">
              {state.success === "Feedback sent to the student."
                ? "The student can now see this feedback on their deliverable page."
                : "This feedback is saved for teacher review and is not visible to the student yet."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {nextReviewHref ? (
              <Link href={nextReviewHref} className="font-medium underline-offset-4 hover:underline">
                Next review item
              </Link>
            ) : null}
            <Link href={studentHref} className="font-medium underline-offset-4 hover:underline">
              Back to student
            </Link>
            <Link href={classHref} className="font-medium underline-offset-4 hover:underline">
              Class dashboard
            </Link>
            <Link href={reviewQueueHref} className="font-medium underline-offset-4 hover:underline">
              Review queue
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
        {isPending ? "Saving..." : saveActionLabel}
      </Button>
    </form>
  );
}

function isStudentVisibleStatus(status: SubmissionStatus) {
  return status === "revision_needed" || status === "passed";
}

function getStatusHelpText(status: SubmissionStatus) {
  switch (status) {
    case "revision_needed":
      return "Sends feedback and returns this deliverable to the student for revision.";
    case "passed":
      return "Sends acceptance feedback for this deliverable. Use only after checking the submitted evidence yourself.";
    case "submitted":
      return "Keeps the item as newly submitted. Feedback is saved as an internal teacher draft.";
    case "under_review":
      return "Marks the item as being reviewed. Feedback is saved as an internal teacher draft.";
    default:
      return "This status is teacher-only for the current review workflow.";
  }
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
