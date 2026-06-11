"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SubmissionStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getFeedbackTemplatesForCriterion } from "@/lib/feedback-templates";
import { formatSubmissionStatus, teacherReviewStatuses } from "@/lib/submissions";

import { updateTeacherFeedbackAction } from "../../actions";

const teacherFeedbackMaxLength = 8000;

type TeacherFeedbackFormProps = {
  classId: string;
  slotId: string;
  criterionCode: string;
  currentStatus: SubmissionStatus;
  feedback: string;
  queueHref: string;
  aiReviewState: "missing" | "current" | "stale" | "failed" | "pending";
  nextReviewHref?: string;
  latestVersionLabel?: string;
  latestSubmittedLabel?: string;
  reviewedLabel?: string | null;
};

export function TeacherFeedbackForm({
  classId,
  slotId,
  criterionCode,
  currentStatus,
  feedback,
  queueHref,
  aiReviewState,
  nextReviewHref,
  latestVersionLabel,
  latestSubmittedLabel,
  reviewedLabel,
}: TeacherFeedbackFormProps) {
  const [feedbackDraft, setFeedbackDraft] = useState(feedback);
  const [selectedStatus, setSelectedStatus] = useState(
    (teacherReviewStatuses as readonly string[]).includes(currentStatus)
      ? currentStatus
      : "under_review",
  );
  const feedbackTemplates = getFeedbackTemplatesForCriterion(criterionCode);
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    feedbackTemplates[0]?.id ?? "",
  );
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const feedbackTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [state, formAction, isPending] = useActionState(
    updateTeacherFeedbackAction,
    {},
  );

  const focusFeedbackTextarea = useCallback(() => {
    window.setTimeout(() => {
      feedbackTextareaRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      feedbackTextareaRef.current?.focus();
    }, 0);
  }, []);

  useEffect(() => {
    function handleCopyAIFeedback(event: Event) {
      const customEvent = event as CustomEvent<{ feedbackDraft?: string }>;
      const aiFeedbackDraft = customEvent.detail?.feedbackDraft;

      if (!aiFeedbackDraft) {
        return;
      }

      setFeedbackDraft((currentFeedback) => {
        const nextFeedback = currentFeedback.trim()
          ? `${currentFeedback.trim()}\n\n${aiFeedbackDraft}`
          : aiFeedbackDraft;

        if (nextFeedback.length > teacherFeedbackMaxLength) {
          setCopyNotice("AI notes were shortened to fit the feedback limit.");
          return nextFeedback.slice(0, teacherFeedbackMaxLength);
        }

        setCopyNotice("AI notes copied into feedback draft.");
        return nextFeedback.slice(0, teacherFeedbackMaxLength);
      });
      focusFeedbackTextarea();
    }

    window.addEventListener(
      "ia-supervisor:copy-ai-feedback",
      handleCopyAIFeedback,
    );

    return () => {
      window.removeEventListener(
        "ia-supervisor:copy-ai-feedback",
        handleCopyAIFeedback,
      );
    };
  }, [focusFeedbackTextarea]);

  useEffect(() => {
    if (state.success === "Feedback sent to the student.") {
      const timeoutId = window.setTimeout(() => {
        setFeedbackDraft("");
        setCopyNotice("Feedback was sent. The draft box is ready for new notes.");
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }
  }, [state.success]);

  const selectedTemplate =
    feedbackTemplates.find((template) => template.id === selectedTemplateId) ??
    feedbackTemplates[0];

  function appendFeedbackTemplate() {
    if (!selectedTemplate) {
      return;
    }

    setFeedbackDraft((currentFeedback) => {
      const nextFeedback = currentFeedback.trim()
        ? `${currentFeedback.trim()}\n\n${selectedTemplate.comment}`
        : selectedTemplate.comment;

      if (nextFeedback.length > teacherFeedbackMaxLength) {
        setCopyNotice("Template was shortened to fit the feedback limit.");
        focusFeedbackTextarea();
        return nextFeedback.slice(0, teacherFeedbackMaxLength);
      }

      setCopyNotice(`Template inserted: ${selectedTemplate.title}`);
      focusFeedbackTextarea();
      return nextFeedback;
    });
  }

  const isStudentVisible = isStudentVisibleStatus(selectedStatus);
  const saveActionLabel = isStudentVisible ? "Send feedback" : "Save teacher draft";
  const statusHelp = getStatusHelpText(selectedStatus);

  return (
    <form action={formAction} className="grid content-start gap-4 rounded-md border bg-card p-4">
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="slotId" value={slotId} />
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
        <Label htmlFor={`teacher-status-${slotId}`}>Review status</Label>
        <select
          id={`teacher-status-${slotId}`}
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
        {selectedStatus === "passed" ? (
          <div className="grid gap-1 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Before marking Passed</p>
            <p>{getAIReviewGuardMessage(aiReviewState)}</p>
            <p>
              {feedbackDraft.trim()
                ? "Feedback draft is present."
                : "Add concise feedback or a final note before saving Passed."}
            </p>
          </div>
        ) : null}
      </div>
      {feedbackTemplates.length > 0 ? (
        <details className="rounded-md border bg-muted/20">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
            Comment templates
          </summary>
          <div className="grid gap-2 border-t p-3">
            <div className="grid gap-1">
              <Label htmlFor={`feedback-template-${slotId}`}>
                Template
              </Label>
              <select
                id={`feedback-template-${slotId}`}
                value={selectedTemplateId}
                onChange={(event) => setSelectedTemplateId(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {feedbackTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))}
              </select>
            </div>
            {selectedTemplate ? (
              <p className="text-xs text-muted-foreground">
                {selectedTemplate.teacherNote}
              </p>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={appendFeedbackTemplate}
            >
              Insert template
            </Button>
          </div>
        </details>
      ) : null}
      <div className="grid gap-1">
        <Label htmlFor={`teacher-feedback-${slotId}`}>Feedback</Label>
        <textarea
          ref={feedbackTextareaRef}
          id={`teacher-feedback-${slotId}`}
          name="teacherFeedback"
          value={feedbackDraft}
          onChange={(event) => setFeedbackDraft(event.target.value)}
          rows={5}
          maxLength={teacherFeedbackMaxLength}
          className="min-h-28 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Write feedback for this criterion."
        />
        <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{copyNotice ?? "Use concise notes for the student-facing review decision."}</p>
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
                ? "The student can now see this feedback on their criterion page."
                : "This feedback is saved for teacher review and is not visible to the student yet."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {nextReviewHref ? (
              <Link href={nextReviewHref} className="font-medium underline-offset-4 hover:underline">
                Next review item
              </Link>
            ) : null}
            <Link href={queueHref} className="font-medium underline-offset-4 hover:underline">
              Back to review queue
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
          : saveActionLabel}
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
      return "Sends feedback and returns the criterion to the student for a revised PDF.";
    case "passed":
      return "Sends final acceptance feedback for this criterion. Use only after checking the evidence yourself.";
    case "submitted":
      return "Keeps the item in the queue as newly submitted. Feedback is saved as an internal teacher draft.";
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

function getAIReviewGuardMessage(
  aiReviewState: TeacherFeedbackFormProps["aiReviewState"],
) {
  switch (aiReviewState) {
    case "current":
      return "AI review covers the latest submitted version.";
    case "stale":
      return "AI review is stale because the student submitted a newer version.";
    case "failed":
      return "The latest AI review failed; rely on manual review or retry AI review first.";
    case "pending":
      return "AI review is pending or incomplete.";
    case "missing":
    default:
      return "No AI review has been captured for this latest submitted version.";
  }
}
