"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { getFeedbackTemplatesForCriterion } from "@/lib/feedback-templates";
import { formatSubmissionStatus, teacherReviewStatuses } from "@/lib/submissions";

import { updateTeacherFeedbackAction } from "../../actions";

const teacherFeedbackMaxLength = 4000;

type TeacherFeedbackFormProps = {
  classId: string;
  slotId: string;
  criterionCode: string;
  currentStatus: string;
  feedback: string;
  queueHref: string;
  aiReviewState: "missing" | "current" | "stale" | "failed" | "pending";
  nextReviewHref?: string;
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
  const [state, formAction, isPending] = useActionState(
    updateTeacherFeedbackAction,
    {},
  );

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
  }, []);

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
        return nextFeedback.slice(0, teacherFeedbackMaxLength);
      }

      setCopyNotice(`Template inserted: ${selectedTemplate.title}`);
      return nextFeedback;
    });
  }

  return (
    <form action={formAction} className="grid content-start gap-3 rounded-md border p-3">
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="slotId" value={slotId} />
      <div className="grid gap-1">
        <Label htmlFor={`teacher-status-${slotId}`}>Review status</Label>
        <select
          id={`teacher-status-${slotId}`}
          name="status"
          value={selectedStatus}
          onChange={(event) => setSelectedStatus(event.target.value)}
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
            ? "Saving with this status sends the feedback to the student."
            : "Saving with this status keeps the feedback as a teacher draft."}
        </p>
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
        <div className="grid gap-2 rounded-md border bg-muted/20 p-3">
          <div className="grid gap-1">
            <Label htmlFor={`feedback-template-${slotId}`}>
              Comment template
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
      ) : null}
      <div className="grid gap-1">
        <Label htmlFor={`teacher-feedback-${slotId}`}>Feedback</Label>
        <textarea
          id={`teacher-feedback-${slotId}`}
          name="teacherFeedback"
          value={feedbackDraft}
          onChange={(event) => setFeedbackDraft(event.target.value)}
          rows={6}
          maxLength={teacherFeedbackMaxLength}
          className="min-h-32 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        <div className="grid gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <p>{state.success}</p>
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
          : isStudentVisibleStatus(selectedStatus)
            ? "Send feedback"
            : "Save draft"}
      </Button>
    </form>
  );
}

function isStudentVisibleStatus(status: string) {
  return status === "revision_needed" || status === "passed";
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
