import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

import { createSubjectAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminSubjectsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return <AdminAccessMessage title="Sign in required" description="Use an admin account to manage subjects." />;
  }

  if (user.role !== "admin") {
    return <AdminAccessMessage title="Admin account required" description="Subjects can only be managed by platform admins." />;
  }

  const subjects = await prisma.subject.findMany({
    orderBy: [{ isArchived: "asc" }, { name: "asc" }],
    include: {
      criteria: { select: { id: true } },
      deliverableTemplates: { select: { id: true, isArchived: true } },
      milestoneTemplates: { select: { id: true, isArchived: true } },
      activeAssessmentReference: {
        select: {
          key: true,
          title: true,
          files: { select: { id: true } },
        },
      },
    },
  });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Admin workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">Subjects</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage subject-level criteria and milestone templates. Teachers create classes from these standards.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/assessment">Assessment reference</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/teacher/dashboard">Teacher dashboard</Link>
          </Button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Create subject</CardTitle>
            <CardDescription>
              Add a new subject before defining its criteria and milestone template.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createSubjectAction} className="grid gap-3">
              <div className="grid gap-1">
                <Label htmlFor="subject-name">Name</Label>
                <Input id="subject-name" name="name" placeholder="IB Computer Science" required />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="subject-slug">Slug</Label>
                <Input id="subject-slug" name="slug" placeholder="ib-computer-science" required />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" name="isArchived" className="h-4 w-4" />
                Create as archived
              </label>
              <Button type="submit">Create subject</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Subject standards</CardTitle>
            <CardDescription>
              Criteria and milestone templates are copied into teacher classes, then teachers can adjust class dates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {subjects.length > 0 ? (
              <div className="grid gap-3">
                {subjects.map((subject) => {
                  const activeTemplateCount = subject.milestoneTemplates.filter(
                    (template) => !template.isArchived,
                  ).length;
                  const activeDeliverableCount = subject.deliverableTemplates.filter(
                    (template) => !template.isArchived,
                  ).length;

                  return (
                    <div key={subject.id} className="rounded-md border p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="font-medium">{subject.name}</h2>
                            {subject.isArchived ? (
                              <span className="rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-xs font-semibold text-stone-700">
                                Archived
                              </span>
                            ) : (
                              <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {subject.slug}
                          </p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {subject.criteria.length} criteria ·{" "}
                            {activeDeliverableCount} submission templates ·{" "}
                            {activeTemplateCount} active milestones
                          </p>
                          {subject.activeAssessmentReference ? (
                            <p className="mt-1 text-sm text-muted-foreground">
                              Reference: {subject.activeAssessmentReference.title} ·{" "}
                              {subject.activeAssessmentReference.files.length} files
                            </p>
                          ) : (
                            <p className="mt-1 text-sm text-amber-700">
                              No active assessment reference
                            </p>
                          )}
                        </div>
                        <Button asChild size="sm">
                          <Link href={`/admin/subjects/${subject.id}`}>
                            Manage
                          </Link>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No subjects yet. Create the first subject to enable teacher classes.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
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
