import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEFAULT_REFERENCE_KEY,
  getAdminAssessmentReferenceOverview,
  getAssessmentReferenceFiles,
  type AssessmentReferenceFileName,
} from "@/lib/assessment-reference";
import { getCurrentUser } from "@/lib/current-user";

import { updateAssessmentReferenceAction } from "./actions";

export const dynamic = "force-dynamic";

const referenceFileLabels: Record<AssessmentReferenceFileName, string> = {
  "criteria.md": "Criteria",
  "rubric.md": "Rubric summary",
  "prompt-guidance.md": "Prompt guidance",
};

export default async function AdminAssessmentPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getCurrentUser();
  const { saved } = await searchParams;

  if (!user) {
    return <AdminAccessMessage title="Sign in required" description="Use an admin account to manage assessment references." />;
  }

  if (user.role !== "admin") {
    return <AdminAccessMessage title="Admin account required" description="Assessment references can only be edited by platform admins." />;
  }

  const [files, subjects] = await Promise.all([
    getAssessmentReferenceFiles(DEFAULT_REFERENCE_KEY),
    getAdminAssessmentReferenceOverview(),
  ]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Admin workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">
            Assessment reference
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Active standard: IB Computer Science IA 2027 · {DEFAULT_REFERENCE_KEY}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/subjects">Subjects</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/teacher/dashboard">Teacher dashboard</Link>
          </Button>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">2027 syllabus lock</CardTitle>
          <CardDescription>
            AI review uses these files as the assessment reference. Keep content aligned to the new 2027 syllabus only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Changes take effect on the next AI review run. Existing AI review history is not rewritten.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Subject reference mapping</CardTitle>
          <CardDescription>
            AI review resolves the active assessment reference through the class subject.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {subjects.map((subject) => (
              <div
                key={subject.id}
                className="flex flex-col gap-1 rounded-md border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{subject.name}</p>
                  <p className="text-xs text-muted-foreground">{subject.slug}</p>
                </div>
                {subject.activeAssessmentReference ? (
                  <div className="text-left sm:text-right">
                    <p className="font-medium">
                      {subject.activeAssessmentReference.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {subject.activeAssessmentReference.key} ·{" "}
                      {subject.activeAssessmentReference.files.length} files
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-red-700">No active reference</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-4">
        {files.map((file) => (
          <Card key={file.fileName}>
            <CardHeader>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-lg">
                    {referenceFileLabels[file.fileName]}
                  </CardTitle>
                  <CardDescription>{file.fileName}</CardDescription>
                </div>
                {saved === file.fileName ? (
                  <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                    Saved
                  </p>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>
              <form action={updateAssessmentReferenceAction} className="grid gap-3">
                <input type="hidden" name="fileName" value={file.fileName} />
                <textarea
                  name="content"
                  defaultValue={file.content}
                  rows={18}
                  className="min-h-96 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <div className="flex justify-end">
                  <Button type="submit">Save {referenceFileLabels[file.fileName]}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}

function AdminAccessMessage({
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
