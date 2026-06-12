import Link from "next/link";
import { notFound } from "next/navigation";
import type { SubmissionStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentUser } from "@/lib/current-user";
import {
  formatMilestoneDueLabel,
  formatMilestoneDueState,
  getMilestoneDueState,
  getMilestoneDueTone,
} from "@/lib/milestone-status";
import { prisma } from "@/lib/prisma";
import {
  ensureClassSubmissionSlots,
  formatSubmissionStatus,
} from "@/lib/submissions";

import {
  createMilestoneAction,
  deleteMilestoneAction,
  updateMilestoneAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function TeacherClassPage({
  params,
}: {
  params: Promise<{ classId: string }>;
}) {
  const user = await getCurrentUser();
  const { classId } = await params;

  if (!user) {
    return <AccessMessage title="Sign in required" description="Use a teacher account to open this class." />;
  }

  if (user.role !== "teacher") {
    return <AccessMessage title="Teacher account required" description="This class dashboard is reserved for teachers." />;
  }

  const classAccess = await prisma.class.findFirst({
    where: {
      id: classId,
      teacherId: user.id,
    },
    select: { id: true },
  });

  if (!classAccess) {
    notFound();
  }

  await ensureClassSubmissionSlots(classId);

  const classRecord = await prisma.class.findFirst({
    where: {
      id: classId,
      teacherId: user.id,
    },
    include: {
      subject: {
        include: {
          criteria: { orderBy: { sortOrder: "asc" } },
        },
      },
      enrollments: {
        orderBy: { enrolledAt: "asc" },
        include: {
          student: { select: { name: true, email: true } },
          submissionSlots: {
            include: {
              criterion: true,
              latestVersion: true,
              aiReviewRuns: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                  status: true,
                  submissionVersionId: true,
                },
              },
            },
          },
          deliverableSlots: {
            include: {
              deliverable: true,
              latestVersion: true,
            },
          },
        },
      },
      milestones: {
        orderBy: { sortOrder: "asc" },
        include: {
          criterion: true,
        },
      },
      deliverables: {
        where: { isArchived: false },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          criteria: {
            orderBy: { sortOrder: "asc" },
            include: {
              criterion: true,
            },
          },
          submissionSlots: {
            include: {
              latestVersion: true,
            },
          },
        },
      },
    },
  });

  if (!classRecord) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-3">
            <Link href="/teacher/dashboard">Back to dashboard</Link>
          </Button>
          <p className="text-sm font-medium text-muted-foreground">Teacher class dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">{classRecord.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {classRecord.subject.name} · {classRecord.examSession}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:items-end">
          <div className="rounded-md border bg-card px-4 py-3 text-sm">
            <p className="text-muted-foreground">Invite code</p>
            <p className="mt-1 font-mono text-xl font-semibold tracking-widest">
              {classRecord.inviteCode}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/teacher/classes/${classRecord.id}/analytics`}>
              View analytics
            </Link>
          </Button>
        </div>
      </section>

      <div className="flex flex-wrap gap-2 rounded-md border bg-card px-3 py-2 text-sm">
        <MetricPill label="Students" value={classRecord.enrollments.length} />
        <MetricPill label="Deliverables" value={classRecord.deliverables.length} />
        <MetricPill label="Milestones" value={classRecord.milestones.length} />
        <MetricPill label="Criteria" value={classRecord.subject.criteria.length} />
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-lg">Students and submissions</CardTitle>
                <CardDescription>
                  Open a student to review files, versions, status, feedback, and reports.
                </CardDescription>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={`/teacher/classes/${classRecord.id}/analytics`}>
                  Analytics
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {classRecord.enrollments.length > 0 ? (
              <div className="grid gap-3">
                {classRecord.enrollments.map((enrollment) => {
                  const sortedSlots = [...enrollment.submissionSlots].sort(
                    (a, b) => a.criterion.sortOrder - b.criterion.sortOrder,
                  );
                  const sortedDeliverableSlots = [...enrollment.deliverableSlots].sort(
                    (a, b) => a.deliverable.sortOrder - b.deliverable.sortOrder,
                  );
                  const progressSlots =
                    sortedDeliverableSlots.length > 0
                      ? [...sortedSlots, ...sortedDeliverableSlots]
                      : sortedSlots;
                  const statusSummary = getStatusSummary(
                    progressSlots.map((slot) => slot.status),
                  );
                  const latestSubmission = progressSlots
                    .map((slot) => slot.latestVersion?.submittedAt)
                    .filter((submittedAt): submittedAt is Date => Boolean(submittedAt))
                    .sort((a, b) => b.getTime() - a.getTime())[0];
                  const isFinalSubmitted =
                    sortedSlots.length > 0 &&
                    sortedSlots.every((slot) => slot.status === "final_submitted");
                  const reviewFocus = getStudentReviewFocus({
                    criterionSlots: sortedSlots,
                    deliverableSlots: sortedDeliverableSlots,
                  });
                  const attentionNote = getStudentAttentionNote(reviewFocus);

                  return (
                    <Link
                      key={enrollment.id}
                      href={`/teacher/classes/${classRecord.id}/students/${enrollment.id}`}
                      className="block rounded-md border p-4 transition-colors hover:bg-muted/60"
                    >
                      <div className="grid gap-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="font-medium">{enrollment.student.name}</h2>
                              {isFinalSubmitted ? (
                                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                                  Final submitted
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {enrollment.student.email}
                            </p>
                          </div>
                          <div className="text-sm text-muted-foreground sm:text-right">
                            <p>Joined {enrollment.enrolledAt.toLocaleDateString()}</p>
                            <p>
                              {latestSubmission
                                ? `Latest submission ${latestSubmission.toLocaleDateString()}`
                                : "No submissions yet"}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                          <ReviewFocusTile
                            label="Criteria to review"
                            value={reviewFocus.criteriaAwaiting}
                            tone={reviewFocus.criteriaAwaiting > 0 ? "info" : "muted"}
                          />
                          <ReviewFocusTile
                            label="Deliverables to review"
                            value={reviewFocus.deliverablesAwaiting}
                            tone={reviewFocus.deliverablesAwaiting > 0 ? "info" : "muted"}
                          />
                          <ReviewFocusTile
                            label="Needs revision"
                            value={reviewFocus.needsRevision}
                            tone={reviewFocus.needsRevision > 0 ? "warning" : "muted"}
                          />
                          <ReviewFocusTile
                            label="AI needs update"
                            value={reviewFocus.needsAIReview}
                            tone={reviewFocus.needsAIReview > 0 ? "warning" : "muted"}
                          />
                        </div>

                        {attentionNote ? (
                          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            {attentionNote}
                          </p>
                        ) : null}

                        <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                          {statusSummary
                            .filter((item) => item.count > 0)
                            .map((item) => (
                              <div
                                key={item.status}
                                className={item.barClassName}
                                style={{
                                  width: `${(item.count / Math.max(progressSlots.length, 1)) * 100}%`,
                                }}
                              />
                            ))}
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {statusSummary.map((item) => (
                            <div key={item.status} className="rounded-md border bg-background px-3 py-2">
                              <p className="text-lg font-semibold">{item.count}</p>
                              <p className="text-xs text-muted-foreground">{item.label}</p>
                            </div>
                          ))}
                        </div>

                        {sortedDeliverableSlots.length > 0 ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {sortedDeliverableSlots.map((slot) => (
                              <div key={slot.id} className="rounded-md bg-background p-2 text-sm">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate font-medium">{slot.deliverable.title}</p>
                                  {isTeacherActionStatus(slot.status) ? (
                                    <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-800">
                                      Review
                                    </span>
                                  ) : null}
                                </div>
                                <p
                                  className={`mt-1 inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${getStatusTone(slot.status)}`}
                                >
                                  {formatSubmissionStatus(slot.status)}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        <div className="grid gap-2 sm:grid-cols-5">
                          {classRecord.subject.criteria.map((criterion) => {
                            const slot = sortedSlots.find(
                              (submissionSlot) => submissionSlot.criterionId === criterion.id,
                            );

                            return (
                              <div key={criterion.id} className="rounded-md bg-background p-2 text-sm">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium">Criterion {criterion.code}</p>
                                  {slot?.status && isTeacherActionStatus(slot.status) ? (
                                    <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-800">
                                      Review
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  <p
                                    className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${getStatusTone(slot?.status ?? "not_started")}`}
                                  >
                                    {slot
                                      ? formatSubmissionStatus(slot.status)
                                      : "Not Started"}
                                  </p>
                                  {slot ? (
                                    <p
                                      className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${getAIReviewTone(getAIReviewState(slot.latestVersionId, slot.aiReviewRuns[0]))}`}
                                    >
                                      {formatAIReviewState(getAIReviewState(slot.latestVersionId, slot.aiReviewRuns[0]))}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No students have joined yet. Share the invite code with your class.
              </p>
            )}
          </CardContent>
        </Card>

        <details className="rounded-md border bg-card">
          <summary className="cursor-pointer px-6 py-4">
            <span className="font-medium">Class setup</span>
            <span className="ml-3 text-sm text-muted-foreground">
              Submission plan, milestones, and assessment reference
            </span>
          </summary>
          <div className="grid gap-4 border-t p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Submission plan</CardTitle>
              <CardDescription>
                Deliverables copied from the subject template. Student submission screens still use criteria until the next migration step.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {classRecord.deliverables.length > 0 ? (
                <div className="grid gap-2">
                  {classRecord.deliverables.map((deliverable) => (
                    <div key={deliverable.id} className="rounded-md border px-3 py-2 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{deliverable.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatReviewMode(deliverable.reviewMode)}
                            {deliverable.fileRequirement
                              ? ` · ${deliverable.fileRequirement}`
                              : ""}
                          </p>
                        </div>
                        <p className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                          #{deliverable.sortOrder}
                        </p>
                      </div>
                      {classRecord.enrollments.length > 0 ? (
                        <div className="mt-2 grid grid-cols-4 gap-1">
                          {getStatusSummary(
                            deliverable.submissionSlots.map((slot) => slot.status),
                          ).map((item) => (
                            <div key={item.status} className="rounded-md bg-muted/50 px-2 py-1">
                              <p className="text-sm font-semibold">{item.count}</p>
                              <p className="text-[11px] text-muted-foreground">{item.label}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {deliverable.criteria.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {deliverable.criteria.map((link) => (
                            <span
                              key={link.id}
                              className="rounded-md border bg-background px-2 py-1 text-xs font-medium"
                            >
                              Criterion {link.criterion.code}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-amber-700">
                          No criteria linked
                        </p>
                      )}
                      {deliverable.description ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {deliverable.description}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No class deliverables have been copied yet. Re-run seed for demo classes or create a new class from an updated subject template.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="lg:row-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Milestones</CardTitle>
              <CardDescription>Edit this class timeline and due dates.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {classRecord.milestones.map((milestone) => (
                  <div key={milestone.id} className="grid gap-3 rounded-md border p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{milestone.title}</p>
                        <p className="mt-1 text-muted-foreground">
                          {formatMilestoneDueLabel(milestone.dueDate)}
                        </p>
                        {milestone.criterion ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Linked to Criterion {milestone.criterion.code}
                          </p>
                        ) : null}
                      </div>
                      <div className="grid justify-items-end gap-2">
                        <p
                          className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold ${getMilestoneDueTone(getMilestoneDueState(milestone.dueDate))}`}
                        >
                          {formatMilestoneDueState(getMilestoneDueState(milestone.dueDate))}
                        </p>
                        <p className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                          #{milestone.sortOrder}
                        </p>
                      </div>
                    </div>
                    <details>
                      <summary className="cursor-pointer text-sm font-medium text-primary">
                        Edit
                      </summary>
                      <div className="mt-3 grid gap-3">
                        <form action={updateMilestoneAction} className="grid gap-3">
                          <input type="hidden" name="classId" value={classRecord.id} />
                          <input type="hidden" name="milestoneId" value={milestone.id} />
                          <div className="grid gap-1">
                            <Label htmlFor={`milestone-title-${milestone.id}`}>Title</Label>
                            <Input
                              id={`milestone-title-${milestone.id}`}
                              name="title"
                              defaultValue={milestone.title}
                              required
                            />
                          </div>
                          <div className="grid gap-1">
                            <Label htmlFor={`milestone-criterion-${milestone.id}`}>
                              Linked criterion
                            </Label>
                            <select
                              key={milestone.criterionId ?? "general"}
                              id={`milestone-criterion-${milestone.id}`}
                              name="criterionId"
                              defaultValue={milestone.criterionId ?? ""}
                              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <option value="">General milestone</option>
                              {classRecord.subject.criteria.map((criterion) => (
                                <option key={criterion.id} value={criterion.id}>
                                  Criterion {criterion.code}: {criterion.title}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-[1fr_90px] gap-2">
                            <div className="grid gap-1">
                              <Label htmlFor={`milestone-due-${milestone.id}`}>Due date</Label>
                              <Input
                                id={`milestone-due-${milestone.id}`}
                                name="dueDate"
                                type="date"
                                defaultValue={formatDateInput(milestone.dueDate)}
                              />
                            </div>
                            <div className="grid gap-1">
                              <Label htmlFor={`milestone-order-${milestone.id}`}>Order</Label>
                              <Input
                                id={`milestone-order-${milestone.id}`}
                                name="sortOrder"
                                type="number"
                                min={0}
                                defaultValue={milestone.sortOrder}
                              />
                            </div>
                          </div>
                          <Button type="submit" size="sm">
                            Save milestone
                          </Button>
                        </form>
                        <form action={deleteMilestoneAction}>
                          <input type="hidden" name="classId" value={classRecord.id} />
                          <input type="hidden" name="milestoneId" value={milestone.id} />
                          <Button
                            type="submit"
                            variant="outline"
                            size="sm"
                            className="w-full text-destructive"
                          >
                            Delete milestone
                          </Button>
                        </form>
                      </div>
                    </details>
                  </div>
                ))}
                <details className="rounded-md border p-3 text-sm">
                  <summary className="cursor-pointer font-medium text-primary">
                    Add milestone
                  </summary>
                  <form action={createMilestoneAction} className="mt-3 grid gap-3">
                    <input type="hidden" name="classId" value={classRecord.id} />
                    <div className="grid gap-1">
                      <Label htmlFor="new-milestone-title">Title</Label>
                      <Input
                        id="new-milestone-title"
                        name="title"
                        placeholder="e.g. Criterion D development checkpoint"
                        required
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="new-milestone-criterion">Linked criterion</Label>
                      <select
                        id="new-milestone-criterion"
                        name="criterionId"
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="">General milestone</option>
                        {classRecord.subject.criteria.map((criterion) => (
                          <option key={criterion.id} value={criterion.id}>
                            Criterion {criterion.code}: {criterion.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="new-milestone-due">Due date</Label>
                      <Input id="new-milestone-due" name="dueDate" type="date" />
                    </div>
                    <Button type="submit" size="sm">
                      Add milestone
                    </Button>
                  </form>
                </details>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">IB CS criteria</CardTitle>
              <CardDescription>Seeded 2027 criterion definitions.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {classRecord.subject.criteria.map((criterion) => (
                  <div key={criterion.id} className="rounded-md border px-3 py-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">Criterion {criterion.code}</p>
                      <p className="text-muted-foreground">{criterion.maxMarks} marks</p>
                    </div>
                    <p className="mt-1 text-muted-foreground">{criterion.title}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          </div>
        </details>
      </div>
    </main>
  );
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-2 rounded-md bg-muted/50 px-3 py-2">
      <span className="text-xs font-medium uppercase text-muted-foreground">
        {label}
      </span>
      <span className="text-lg font-semibold">{value}</span>
    </div>
  );
}

function ReviewFocusTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "info" | "warning" | "muted";
}) {
  return (
    <div className={`rounded-md border px-3 py-2 ${getReviewFocusTone(tone)}`}>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs">{label}</p>
    </div>
  );
}

function getStudentReviewFocus({
  criterionSlots,
  deliverableSlots,
}: {
  criterionSlots: Array<{
    status: SubmissionStatus;
    latestVersionId: string | null;
    aiReviewRuns: Array<{
      status: string;
      submissionVersionId: string | null;
    }>;
  }>;
  deliverableSlots: Array<{ status: SubmissionStatus }>;
}) {
  const criteriaAwaiting = criterionSlots.filter((slot) =>
    isTeacherActionStatus(slot.status),
  ).length;
  const deliverablesAwaiting = deliverableSlots.filter((slot) =>
    isTeacherActionStatus(slot.status),
  ).length;
  const needsRevision = [...criterionSlots, ...deliverableSlots].filter(
    (slot) => slot.status === "revision_needed",
  ).length;
  const needsAIReview = criterionSlots.filter((slot) => {
    if (!isTeacherActionStatus(slot.status)) {
      return false;
    }

    return ["missing", "stale", "failed"].includes(
      getAIReviewState(slot.latestVersionId, slot.aiReviewRuns[0]),
    );
  }).length;

  return {
    criteriaAwaiting,
    deliverablesAwaiting,
    needsRevision,
    needsAIReview,
  };
}

function getStudentAttentionNote(focus: ReturnType<typeof getStudentReviewFocus>) {
  if (focus.criteriaAwaiting > 0 && focus.deliverablesAwaiting > 0) {
    return "This student has both criterion documents and deliverables waiting for teacher review.";
  }

  if (focus.criteriaAwaiting > 0) {
    return "Criterion documents are waiting for teacher review.";
  }

  if (focus.deliverablesAwaiting > 0) {
    return "Deliverables are waiting for teacher review. Confirm the linked criterion scope before sending feedback.";
  }

  if (focus.needsRevision > 0) {
    return "Student revision is needed; wait for a resubmission before reviewing again.";
  }

  if (focus.needsAIReview > 0) {
    return "AI review needs an update before relying on AI notes.";
  }

  return null;
}

function isTeacherActionStatus(status: SubmissionStatus) {
  return status === "submitted" || status === "under_review";
}

function getReviewFocusTone(tone: "info" | "warning" | "muted") {
  switch (tone) {
    case "info":
      return "border-blue-200 bg-blue-50 text-blue-900";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "muted":
    default:
      return "bg-background text-muted-foreground";
  }
}

function formatDateInput(date: Date | null) {
  if (!date) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getAIReviewState(
  latestVersionId: string | null,
  latestAIReviewRun:
    | {
        status: string;
        submissionVersionId: string | null;
      }
    | undefined,
) {
  if (!latestVersionId || !latestAIReviewRun) {
    return "missing";
  }

  if (latestAIReviewRun.submissionVersionId !== latestVersionId) {
    return "stale";
  }

  if (latestAIReviewRun.status === "completed") {
    return "current";
  }

  if (latestAIReviewRun.status === "failed") {
    return "failed";
  }

  return "pending";
}

function formatAIReviewState(state: string) {
  switch (state) {
    case "current":
      return "AI current";
    case "stale":
      return "AI stale";
    case "failed":
      return "AI failed";
    case "pending":
      return "AI pending";
    case "missing":
    default:
      return "No AI";
  }
}

function getAIReviewTone(state: string) {
  switch (state) {
    case "current":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "pending":
      return "border-blue-200 bg-blue-50 text-blue-800";
    case "stale":
    case "failed":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "missing":
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
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

function getStatusSummary(statuses: SubmissionStatus[]) {
  return [
    {
      status: "passed",
      label: "Passed",
      count: statuses.filter(
        (status) => status === "passed" || status === "final_submitted",
      ).length,
      barClassName: "bg-emerald-500",
    },
    {
      status: "submitted",
      label: "Submitted",
      count: statuses.filter(
        (status) => status === "submitted" || status === "under_review",
      ).length,
      barClassName: "bg-blue-500",
    },
    {
      status: "revision_needed",
      label: "Needs revision",
      count: statuses.filter((status) => status === "revision_needed").length,
      barClassName: "bg-amber-500",
    },
    {
      status: "not_started",
      label: "Not started",
      count: statuses.filter(
        (status) =>
          status === "not_started" || status === "draft" || status === "locked",
      ).length,
      barClassName: "bg-slate-300",
    },
  ];
}

function formatReviewMode(value: string) {
  switch (value) {
    case "multi_criteria":
      return "Multi-criteria review";
    case "final_package":
      return "Final package";
    case "single_criterion":
    default:
      return "Single criterion review";
  }
}

function AccessMessage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/login">Go to login</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
