import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

import {
  createCriterionAction,
  createDeliverableTemplateAction,
  createMilestoneTemplateAction,
  updateCriterionAction,
  updateDeliverableTemplateAction,
  updateMilestoneTemplateAction,
  updateSubjectAction,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function AdminSubjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ subjectId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getCurrentUser();
  const { subjectId } = await params;
  const { saved } = await searchParams;

  if (!user) {
    return <AdminAccessMessage title="Sign in required" description="Use an admin account to manage subject standards." />;
  }

  if (user.role !== "admin") {
    return <AdminAccessMessage title="Admin account required" description="Subject standards can only be edited by platform admins." />;
  }

  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    include: {
      criteria: {
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      },
      deliverableTemplates: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          criteria: {
            orderBy: { sortOrder: "asc" },
            include: { criterion: true },
          },
        },
      },
      milestoneTemplates: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          criterion: true,
        },
      },
      activeAssessmentReference: {
        select: { key: true, title: true },
      },
    },
  });

  if (!subject) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-10">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link href="/admin/subjects">Back to subjects</Link>
          </Button>
          <p className="mt-4 text-sm font-medium text-muted-foreground">
            Admin subject standard
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal">
            {subject.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {subject.slug}
            {subject.activeAssessmentReference
              ? ` · ${subject.activeAssessmentReference.title}`
              : " · No active assessment reference"}
          </p>
        </div>
        {saved ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
            Saved {formatSavedLabel(saved)}
          </p>
        ) : null}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Subject settings</CardTitle>
          <CardDescription>
            Archived subjects remain available to existing classes but cannot be selected for new classes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateSubjectAction} className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <input type="hidden" name="subjectId" value={subject.id} />
            <div className="grid gap-1">
              <Label htmlFor="subject-name">Name</Label>
              <Input id="subject-name" name="name" defaultValue={subject.name} required />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="subject-slug">Slug</Label>
              <Input id="subject-slug" name="slug" defaultValue={subject.slug} required />
            </div>
            <div className="grid gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  name="isArchived"
                  defaultChecked={subject.isArchived}
                  className="h-4 w-4"
                />
                Archived
              </label>
              <Button type="submit" size="sm">Save subject</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Submission templates</CardTitle>
          <CardDescription>
            Define what students submit for this subject. A deliverable can map to one criterion, many criteria, or a final package.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {subject.deliverableTemplates.map((deliverable) => {
              const linkedCriterionIds = new Set(
                deliverable.criteria.map((link) => link.criterionId),
              );

              return (
                <form
                  key={deliverable.id}
                  action={updateDeliverableTemplateAction}
                  className="grid gap-3 rounded-md border p-3 text-sm"
                >
                  <input type="hidden" name="subjectId" value={subject.id} />
                  <input type="hidden" name="deliverableId" value={deliverable.id} />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">Template item #{deliverable.sortOrder}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatReviewMode(deliverable.reviewMode)} ·{" "}
                        {deliverable.criteria.length} linked criteria
                      </p>
                    </div>
                    {deliverable.isArchived ? (
                      <span className="rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-xs font-semibold text-stone-700">
                        Archived
                      </span>
                    ) : null}
                  </div>
                  <div className="grid gap-2 md:grid-cols-[1fr_220px_100px]">
                    <div className="grid gap-1">
                      <Label htmlFor={`deliverable-title-${deliverable.id}`}>Title</Label>
                      <Input
                        id={`deliverable-title-${deliverable.id}`}
                        name="title"
                        defaultValue={deliverable.title}
                        required
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`deliverable-mode-${deliverable.id}`}>
                        Review mode
                      </Label>
                      <select
                        id={`deliverable-mode-${deliverable.id}`}
                        name="reviewMode"
                        defaultValue={deliverable.reviewMode}
                        className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <option value="single_criterion">Single criterion</option>
                        <option value="multi_criteria">Multi-criteria</option>
                        <option value="final_package">Final package</option>
                      </select>
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`deliverable-order-${deliverable.id}`}>Order</Label>
                      <Input
                        id={`deliverable-order-${deliverable.id}`}
                        name="sortOrder"
                        type="number"
                        min={0}
                        defaultValue={deliverable.sortOrder}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="grid gap-1">
                      <Label htmlFor={`deliverable-description-${deliverable.id}`}>
                        Description
                      </Label>
                      <Input
                        id={`deliverable-description-${deliverable.id}`}
                        name="description"
                        defaultValue={deliverable.description ?? ""}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`deliverable-file-${deliverable.id}`}>
                        File requirement
                      </Label>
                      <Input
                        id={`deliverable-file-${deliverable.id}`}
                        name="fileRequirement"
                        defaultValue={deliverable.fileRequirement ?? ""}
                        placeholder="PDF only"
                      />
                    </div>
                  </div>
                  <fieldset className="grid gap-2 rounded-md border bg-muted/20 p-3">
                    <legend className="px-1 text-xs font-medium text-muted-foreground">
                      Linked criteria
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {subject.criteria.map((criterion) => (
                        <label
                          key={criterion.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            name="criterionIds"
                            value={criterion.id}
                            defaultChecked={linkedCriterionIds.has(criterion.id)}
                            className="h-4 w-4"
                          />
                          Criterion {criterion.code}: {criterion.title}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      name="isArchived"
                      defaultChecked={deliverable.isArchived}
                      className="h-4 w-4"
                    />
                    Archived
                  </label>
                  <Button type="submit" size="sm">Save submission template</Button>
                </form>
              );
            })}

            <details className="rounded-md border p-3 text-sm">
              <summary className="cursor-pointer font-medium text-primary">
                Add submission template
              </summary>
              <form action={createDeliverableTemplateAction} className="mt-3 grid gap-3">
                <input type="hidden" name="subjectId" value={subject.id} />
                <div className="grid gap-2 md:grid-cols-[1fr_220px_100px]">
                  <div className="grid gap-1">
                    <Label htmlFor="new-deliverable-title">Title</Label>
                    <Input
                      id="new-deliverable-title"
                      name="title"
                      placeholder="Criterion A document"
                      required
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="new-deliverable-mode">Review mode</Label>
                    <select
                      id="new-deliverable-mode"
                      name="reviewMode"
                      defaultValue="single_criterion"
                      className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="single_criterion">Single criterion</option>
                      <option value="multi_criteria">Multi-criteria</option>
                      <option value="final_package">Final package</option>
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="new-deliverable-order">Order</Label>
                    <Input
                      id="new-deliverable-order"
                      name="sortOrder"
                      type="number"
                      min={0}
                      defaultValue={subject.deliverableTemplates.length + 1}
                      required
                    />
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="grid gap-1">
                    <Label htmlFor="new-deliverable-description">Description</Label>
                    <Input id="new-deliverable-description" name="description" />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="new-deliverable-file">File requirement</Label>
                    <Input
                      id="new-deliverable-file"
                      name="fileRequirement"
                      placeholder="PDF only"
                    />
                  </div>
                </div>
                <fieldset className="grid gap-2 rounded-md border bg-muted/20 p-3">
                  <legend className="px-1 text-xs font-medium text-muted-foreground">
                    Linked criteria
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {subject.criteria.map((criterion) => (
                      <label key={criterion.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="criterionIds"
                          value={criterion.id}
                          className="h-4 w-4"
                        />
                        Criterion {criterion.code}: {criterion.title}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Button type="submit" size="sm">Add submission template</Button>
              </form>
            </details>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Assessment criteria</CardTitle>
            <CardDescription>
              Criteria define the documents students submit and the marks used by AI review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {subject.criteria.map((criterion) => (
                <form
                  key={criterion.id}
                  action={updateCriterionAction}
                  className="grid gap-3 rounded-md border p-3 text-sm"
                >
                  <input type="hidden" name="subjectId" value={subject.id} />
                  <input type="hidden" name="criterionId" value={criterion.id} />
                  <div className="grid grid-cols-[90px_1fr_90px] gap-2">
                    <div className="grid gap-1">
                      <Label htmlFor={`criterion-code-${criterion.id}`}>Code</Label>
                      <Input
                        id={`criterion-code-${criterion.id}`}
                        name="code"
                        defaultValue={criterion.code}
                        required
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`criterion-title-${criterion.id}`}>Title</Label>
                      <Input
                        id={`criterion-title-${criterion.id}`}
                        name="title"
                        defaultValue={criterion.title}
                        required
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`criterion-marks-${criterion.id}`}>Marks</Label>
                      <Input
                        id={`criterion-marks-${criterion.id}`}
                        name="maxMarks"
                        type="number"
                        min={0}
                        defaultValue={criterion.maxMarks}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-[1fr_90px] gap-2">
                    <div className="grid gap-1">
                      <Label htmlFor={`criterion-description-${criterion.id}`}>
                        Description
                      </Label>
                      <textarea
                        id={`criterion-description-${criterion.id}`}
                        name="description"
                        defaultValue={criterion.description ?? ""}
                        rows={2}
                        className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`criterion-order-${criterion.id}`}>Order</Label>
                      <Input
                        id={`criterion-order-${criterion.id}`}
                        name="sortOrder"
                        type="number"
                        min={0}
                        defaultValue={criterion.sortOrder}
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" size="sm">Save criterion</Button>
                </form>
              ))}

              <details className="rounded-md border p-3 text-sm">
                <summary className="cursor-pointer font-medium text-primary">
                  Add criterion
                </summary>
                <form action={createCriterionAction} className="mt-3 grid gap-3">
                  <input type="hidden" name="subjectId" value={subject.id} />
                  <div className="grid grid-cols-[90px_1fr_90px] gap-2">
                    <div className="grid gap-1">
                      <Label htmlFor="new-criterion-code">Code</Label>
                      <Input id="new-criterion-code" name="code" placeholder="A" required />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="new-criterion-title">Title</Label>
                      <Input id="new-criterion-title" name="title" required />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="new-criterion-marks">Marks</Label>
                      <Input id="new-criterion-marks" name="maxMarks" type="number" min={0} required />
                    </div>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="new-criterion-description">Description</Label>
                    <textarea
                      id="new-criterion-description"
                      name="description"
                      rows={2}
                      className="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="new-criterion-order">Order</Label>
                    <Input
                      id="new-criterion-order"
                      name="sortOrder"
                      type="number"
                      min={0}
                      defaultValue={subject.criteria.length + 1}
                      required
                    />
                  </div>
                  <Button type="submit" size="sm">Add criterion</Button>
                </form>
              </details>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Milestone template</CardTitle>
            <CardDescription>
              New teacher classes copy this subject template. Teachers can then adjust class due dates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {subject.milestoneTemplates.map((template) => (
                <form
                  key={template.id}
                  action={updateMilestoneTemplateAction}
                  className="grid gap-3 rounded-md border p-3 text-sm"
                >
                  <input type="hidden" name="subjectId" value={subject.id} />
                  <input type="hidden" name="templateId" value={template.id} />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">Template item #{template.sortOrder}</p>
                    {template.isArchived ? (
                      <span className="rounded-md border border-stone-200 bg-stone-50 px-2 py-1 text-xs font-semibold text-stone-700">
                        Archived
                      </span>
                    ) : null}
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`template-title-${template.id}`}>Title</Label>
                    <Input
                      id={`template-title-${template.id}`}
                      name="title"
                      defaultValue={template.title}
                      required
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor={`template-criterion-${template.id}`}>
                      Linked criterion
                    </Label>
                    <select
                      id={`template-criterion-${template.id}`}
                      name="criterionId"
                      defaultValue={template.criterionId ?? ""}
                      className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">General milestone</option>
                      {subject.criteria.map((criterion) => (
                        <option key={criterion.id} value={criterion.id}>
                          Criterion {criterion.code}: {criterion.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-[1fr_100px_100px] gap-2">
                    <div className="grid gap-1">
                      <Label htmlFor={`template-description-${template.id}`}>
                        Description
                      </Label>
                      <Input
                        id={`template-description-${template.id}`}
                        name="description"
                        defaultValue={template.description ?? ""}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`template-offset-${template.id}`}>Offset</Label>
                      <Input
                        id={`template-offset-${template.id}`}
                        name="defaultOffsetDays"
                        type="number"
                        min={0}
                        placeholder="days"
                        defaultValue={template.defaultOffsetDays ?? ""}
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`template-order-${template.id}`}>Order</Label>
                      <Input
                        id={`template-order-${template.id}`}
                        name="sortOrder"
                        type="number"
                        min={0}
                        defaultValue={template.sortOrder}
                        required
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      name="isArchived"
                      defaultChecked={template.isArchived}
                      className="h-4 w-4"
                    />
                    Archived
                  </label>
                  <Button type="submit" size="sm">Save template item</Button>
                </form>
              ))}

              <details className="rounded-md border p-3 text-sm">
                <summary className="cursor-pointer font-medium text-primary">
                  Add milestone template
                </summary>
                <form action={createMilestoneTemplateAction} className="mt-3 grid gap-3">
                  <input type="hidden" name="subjectId" value={subject.id} />
                  <div className="grid gap-1">
                    <Label htmlFor="new-template-title">Title</Label>
                    <Input
                      id="new-template-title"
                      name="title"
                      placeholder="Criterion A: Problem specification"
                      required
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="new-template-criterion">Linked criterion</Label>
                    <select
                      id="new-template-criterion"
                      name="criterionId"
                      className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">General milestone</option>
                      {subject.criteria.map((criterion) => (
                        <option key={criterion.id} value={criterion.id}>
                          Criterion {criterion.code}: {criterion.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <Label htmlFor="new-template-description">Description</Label>
                    <Input id="new-template-description" name="description" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1">
                      <Label htmlFor="new-template-offset">Default offset days</Label>
                      <Input id="new-template-offset" name="defaultOffsetDays" type="number" min={0} />
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor="new-template-order">Order</Label>
                      <Input
                        id="new-template-order"
                        name="sortOrder"
                        type="number"
                        min={0}
                        defaultValue={subject.milestoneTemplates.length + 1}
                        required
                      />
                    </div>
                  </div>
                  <Button type="submit" size="sm">Add template item</Button>
                </form>
              </details>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function formatSavedLabel(value: string) {
  switch (value) {
    case "subject":
      return "subject";
    case "criterion":
      return "criterion";
    case "milestone":
      return "milestone template";
    case "deliverable":
      return "submission template";
    default:
      return "changes";
  }
}

function formatReviewMode(value: string) {
  switch (value) {
    case "multi_criteria":
      return "Multi-criteria";
    case "final_package":
      return "Final package";
    case "single_criterion":
    default:
      return "Single criterion";
  }
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
