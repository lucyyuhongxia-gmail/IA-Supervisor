import Link from "next/link";
import { notFound } from "next/navigation";

import { FeedbackDisplay } from "@/components/feedback-display";
import { PrintButton } from "@/components/print-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { ensureEnrollmentSubmissionSlots, formatSubmissionStatus } from "@/lib/submissions";

export const dynamic = "force-dynamic";

export default async function StudentFeedbackPrintPage({
  params,
}: {
  params: Promise<{ classId: string; criterionId: string }>;
}) {
  const user = await getCurrentUser();
  const { classId, criterionId } = await params;

  if (!user) {
    return <AccessMessage title="Sign in required" description="Use a student account to view feedback." />;
  }

  if (user.role !== "student") {
    return <AccessMessage title="Student account required" description="This feedback page is reserved for students." />;
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: { classId, studentId: user.id },
    select: { id: true },
  });

  if (!enrollment) {
    notFound();
  }

  await ensureEnrollmentSubmissionSlots({ enrollmentId: enrollment.id, classId });

  const classRecord = await prisma.class.findFirst({
    where: { id: classId },
    include: {
      subject: true,
      teacher: { select: { name: true, email: true } },
    },
  });

  if (!classRecord) {
    notFound();
  }

  const criterion = await prisma.criterionDef.findFirst({
    where: {
      id: criterionId,
      subjectId: classRecord.subjectId,
    },
    include: {
      submissionSlots: {
        where: { enrollmentId: enrollment.id },
        include: {
          latestVersion: {
            include: {
              feedbackSnapshots: {
                where: { status: "sent" },
                orderBy: { sentAt: "desc" },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!criterion) {
    notFound();
  }

  const slot = criterion.submissionSlots[0];

  if (!slot) {
    notFound();
  }

  const latestVersion = slot.latestVersion;
  const sentFeedback = latestVersion?.feedbackSnapshots[0];
  const teacherFeedback =
    sentFeedback?.content ?? latestVersion?.teacherFeedback ?? slot.teacherFeedback;
  const reviewedAt = latestVersion?.reviewedAt ?? slot.reviewedAt;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 bg-background px-6 py-8 print:min-h-0 print:max-w-none print:bg-white print:px-8 print:py-6 print:text-black">
      <style>{`
        @page {
          size: A4;
          margin: 16mm;
        }

        @media print {
          html,
          body {
            background: white !important;
          }
        }
      `}</style>
      <section className="flex flex-col gap-3 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="ghost" size="sm" className="-ml-3">
          <Link href={`/student/classes/${classRecord.id}/criteria/${criterion.id}`}>
            Back to criterion
          </Link>
        </Button>
        <PrintButton label="Print / save as PDF" />
      </section>

      <article className="rounded-md border bg-card p-6 print:border-0 print:bg-white print:p-0">
        <header className="border-b pb-4">
          <p className="text-sm font-medium text-muted-foreground">
            IA Supervisor feedback
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">
            Criterion {criterion.code}: {criterion.title}
          </h1>
          <div className="mt-3 grid gap-1 text-sm text-muted-foreground">
            <p>{classRecord.name} · {classRecord.subject.name}</p>
            <p>Teacher: {classRecord.teacher.name ?? classRecord.teacher.email}</p>
            <p>Student: {user.name ?? user.email}</p>
            <p>Status: {formatSubmissionStatus(slot.status)}</p>
            {latestVersion ? <p>Version: v{latestVersion.versionNumber}</p> : null}
            {reviewedAt ? <p>Reviewed: {reviewedAt.toLocaleString()}</p> : null}
          </div>
        </header>

        <section className="mt-6">
          {teacherFeedback ? (
            <FeedbackDisplay content={teacherFeedback} />
          ) : (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              No student-visible feedback has been sent for this criterion yet.
            </p>
          )}
        </section>

        <footer className="mt-8 border-t pt-4 text-xs text-muted-foreground">
          <p>
            This feedback is teacher guidance for revision. Teacher judgement remains final.
          </p>
        </footer>
      </article>
    </main>
  );
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
