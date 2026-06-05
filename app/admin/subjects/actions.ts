"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit-log";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

const subjectSchema = z.object({
  subjectId: z.string().optional(),
  name: z.string().trim().min(2, "Enter a subject name.").max(100),
  slug: z
    .string()
    .trim()
    .min(2, "Enter a subject slug.")
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers, and hyphens."),
  isArchived: z.boolean().default(false),
});

const criterionSchema = z.object({
  subjectId: z.string().min(1),
  criterionId: z.string().optional(),
  code: z.string().trim().min(1).max(10),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  maxMarks: z.coerce.number().int().min(0).max(100),
  sortOrder: z.coerce.number().int().min(0).max(100),
});

const milestoneTemplateSchema = z.object({
  subjectId: z.string().min(1),
  templateId: z.string().optional(),
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().max(1000).optional(),
  criterionId: z.string().trim().optional(),
  defaultOffsetDays: z
    .union([z.coerce.number().int().min(0).max(1000), z.literal("")])
    .optional(),
  sortOrder: z.coerce.number().int().min(0).max(100),
  isArchived: z.boolean().default(false),
});

const deliverableTemplateSchema = z.object({
  subjectId: z.string().min(1),
  deliverableId: z.string().optional(),
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().max(1000).optional(),
  fileRequirement: z.string().trim().max(500).optional(),
  reviewMode: z.enum(["single_criterion", "multi_criteria", "final_package"]),
  criterionIds: z.array(z.string().min(1)).default([]),
  sortOrder: z.coerce.number().int().min(0).max(100),
  isArchived: z.boolean().default(false),
});

export async function createSubjectAction(formData: FormData) {
  const user = await requireAdmin();
  const parsed = subjectSchema.omit({ subjectId: true }).parse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    isArchived: formData.get("isArchived") === "on",
  });

  const subject = await prisma.subject.create({
    data: parsed,
    select: { id: true, slug: true },
  });

  await createAuditLog({
    actorId: user.id,
    actorRole: "admin",
    entityType: "subject",
    entityId: subject.id,
    action: "subject.created",
    toState: parsed.isArchived ? "archived" : "active",
    metadata: { slug: subject.slug },
  });

  revalidatePath("/admin/subjects");
  redirect(`/admin/subjects/${subject.id}?saved=subject`);
}

export async function updateSubjectAction(formData: FormData) {
  const user = await requireAdmin();
  const parsed = subjectSchema.parse({
    subjectId: formData.get("subjectId"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    isArchived: formData.get("isArchived") === "on",
  });

  const subject = await prisma.subject.update({
    where: { id: parsed.subjectId },
    data: {
      name: parsed.name,
      slug: parsed.slug,
      isArchived: parsed.isArchived,
    },
    select: { id: true, slug: true },
  });

  await createAuditLog({
    actorId: user.id,
    actorRole: "admin",
    entityType: "subject",
    entityId: subject.id,
    action: "subject.updated",
    toState: parsed.isArchived ? "archived" : "active",
    metadata: { slug: subject.slug },
  });

  revalidatePath("/admin/subjects");
  revalidatePath(`/admin/subjects/${subject.id}`);
  redirect(`/admin/subjects/${subject.id}?saved=subject`);
}

export async function createCriterionAction(formData: FormData) {
  const user = await requireAdmin();
  const parsed = criterionSchema.omit({ criterionId: true }).parse({
    subjectId: formData.get("subjectId"),
    code: formData.get("code"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    maxMarks: formData.get("maxMarks"),
    sortOrder: formData.get("sortOrder"),
  });

  const criterion = await prisma.criterionDef.create({
    data: {
      subjectId: parsed.subjectId,
      code: parsed.code.toUpperCase(),
      title: parsed.title,
      description: parsed.description,
      maxMarks: parsed.maxMarks,
      sortOrder: parsed.sortOrder,
    },
    select: { id: true, subjectId: true, code: true },
  });

  await createAuditLog({
    actorId: user.id,
    actorRole: "admin",
    entityType: "criterion_def",
    entityId: criterion.id,
    action: "criterion.created",
    toState: "active",
    metadata: { subjectId: criterion.subjectId, code: criterion.code },
  });

  revalidatePath(`/admin/subjects/${criterion.subjectId}`);
  redirect(`/admin/subjects/${criterion.subjectId}?saved=criterion`);
}

export async function updateCriterionAction(formData: FormData) {
  const user = await requireAdmin();
  const parsed = criterionSchema.parse({
    subjectId: formData.get("subjectId"),
    criterionId: formData.get("criterionId"),
    code: formData.get("code"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    maxMarks: formData.get("maxMarks"),
    sortOrder: formData.get("sortOrder"),
  });

  const criterion = await prisma.criterionDef.update({
    where: { id: parsed.criterionId },
    data: {
      code: parsed.code.toUpperCase(),
      title: parsed.title,
      description: parsed.description,
      maxMarks: parsed.maxMarks,
      sortOrder: parsed.sortOrder,
    },
    select: { id: true, subjectId: true, code: true },
  });

  await createAuditLog({
    actorId: user.id,
    actorRole: "admin",
    entityType: "criterion_def",
    entityId: criterion.id,
    action: "criterion.updated",
    toState: "active",
    metadata: { subjectId: criterion.subjectId, code: criterion.code },
  });

  revalidatePath(`/admin/subjects/${criterion.subjectId}`);
  redirect(`/admin/subjects/${criterion.subjectId}?saved=criterion`);
}

export async function createDeliverableTemplateAction(formData: FormData) {
  const user = await requireAdmin();
  const parsed = deliverableTemplateSchema.omit({ deliverableId: true }).parse({
    subjectId: formData.get("subjectId"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    fileRequirement: formData.get("fileRequirement") || undefined,
    reviewMode: formData.get("reviewMode"),
    criterionIds: formData.getAll("criterionIds"),
    sortOrder: formData.get("sortOrder"),
    isArchived: formData.get("isArchived") === "on",
  });
  const criterionIds = await getValidCriterionIdsForSubject(
    parsed.subjectId,
    parsed.criterionIds,
  );

  const deliverable = await prisma.$transaction(async (tx) => {
    const created = await tx.subjectDeliverableTemplate.create({
      data: {
        subjectId: parsed.subjectId,
        title: parsed.title,
        description: parsed.description,
        fileRequirement: parsed.fileRequirement,
        reviewMode: parsed.reviewMode,
        sortOrder: parsed.sortOrder,
        isArchived: parsed.isArchived,
        criteria: {
          create: criterionIds.map((criterionId, index) => ({
            criterionId,
            sortOrder: index + 1,
          })),
        },
      },
      select: { id: true, subjectId: true, title: true, reviewMode: true },
    });

    await createAuditLog(
      {
        actorId: user.id,
        actorRole: "admin",
        entityType: "subject_deliverable_template",
        entityId: created.id,
        action: "subject_deliverable_template.created",
        toState: parsed.isArchived ? "archived" : "active",
        metadata: {
          subjectId: created.subjectId,
          title: created.title,
          reviewMode: created.reviewMode,
          criterionCount: criterionIds.length,
        },
      },
      tx,
    );

    return created;
  });

  revalidatePath(`/admin/subjects/${deliverable.subjectId}`);
  redirect(`/admin/subjects/${deliverable.subjectId}?saved=deliverable`);
}

export async function updateDeliverableTemplateAction(formData: FormData) {
  const user = await requireAdmin();
  const parsed = deliverableTemplateSchema.parse({
    subjectId: formData.get("subjectId"),
    deliverableId: formData.get("deliverableId"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    fileRequirement: formData.get("fileRequirement") || undefined,
    reviewMode: formData.get("reviewMode"),
    criterionIds: formData.getAll("criterionIds"),
    sortOrder: formData.get("sortOrder"),
    isArchived: formData.get("isArchived") === "on",
  });
  const criterionIds = await getValidCriterionIdsForSubject(
    parsed.subjectId,
    parsed.criterionIds,
  );

  const deliverable = await prisma.$transaction(async (tx) => {
    const updated = await tx.subjectDeliverableTemplate.update({
      where: { id: parsed.deliverableId },
      data: {
        title: parsed.title,
        description: parsed.description,
        fileRequirement: parsed.fileRequirement,
        reviewMode: parsed.reviewMode,
        sortOrder: parsed.sortOrder,
        isArchived: parsed.isArchived,
        criteria: {
          deleteMany: {},
          create: criterionIds.map((criterionId, index) => ({
            criterionId,
            sortOrder: index + 1,
          })),
        },
      },
      select: { id: true, subjectId: true, title: true, reviewMode: true },
    });

    await createAuditLog(
      {
        actorId: user.id,
        actorRole: "admin",
        entityType: "subject_deliverable_template",
        entityId: updated.id,
        action: "subject_deliverable_template.updated",
        toState: parsed.isArchived ? "archived" : "active",
        metadata: {
          subjectId: updated.subjectId,
          title: updated.title,
          reviewMode: updated.reviewMode,
          criterionCount: criterionIds.length,
        },
      },
      tx,
    );

    return updated;
  });

  revalidatePath(`/admin/subjects/${deliverable.subjectId}`);
  redirect(`/admin/subjects/${deliverable.subjectId}?saved=deliverable`);
}

export async function createMilestoneTemplateAction(formData: FormData) {
  const user = await requireAdmin();
  const parsed = milestoneTemplateSchema.omit({ templateId: true }).parse({
    subjectId: formData.get("subjectId"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    criterionId: formData.get("criterionId") || undefined,
    defaultOffsetDays: formData.get("defaultOffsetDays") ?? "",
    sortOrder: formData.get("sortOrder"),
    isArchived: formData.get("isArchived") === "on",
  });

  const template = await prisma.subjectMilestoneTemplate.create({
    data: {
      subjectId: parsed.subjectId,
      title: parsed.title,
      description: parsed.description,
      criterionId: parsed.criterionId,
      defaultOffsetDays:
        parsed.defaultOffsetDays === "" ? null : parsed.defaultOffsetDays,
      sortOrder: parsed.sortOrder,
      isArchived: parsed.isArchived,
    },
    select: { id: true, subjectId: true, title: true },
  });

  await createAuditLog({
    actorId: user.id,
    actorRole: "admin",
    entityType: "subject_milestone_template",
    entityId: template.id,
    action: "subject_milestone_template.created",
    toState: parsed.isArchived ? "archived" : "active",
    metadata: { subjectId: template.subjectId, title: template.title },
  });

  revalidatePath(`/admin/subjects/${template.subjectId}`);
  redirect(`/admin/subjects/${template.subjectId}?saved=milestone`);
}

export async function updateMilestoneTemplateAction(formData: FormData) {
  const user = await requireAdmin();
  const parsed = milestoneTemplateSchema.parse({
    subjectId: formData.get("subjectId"),
    templateId: formData.get("templateId"),
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    criterionId: formData.get("criterionId") || undefined,
    defaultOffsetDays: formData.get("defaultOffsetDays") ?? "",
    sortOrder: formData.get("sortOrder"),
    isArchived: formData.get("isArchived") === "on",
  });

  const template = await prisma.subjectMilestoneTemplate.update({
    where: { id: parsed.templateId },
    data: {
      title: parsed.title,
      description: parsed.description,
      criterionId: parsed.criterionId,
      defaultOffsetDays:
        parsed.defaultOffsetDays === "" ? null : parsed.defaultOffsetDays,
      sortOrder: parsed.sortOrder,
      isArchived: parsed.isArchived,
    },
    select: { id: true, subjectId: true, title: true },
  });

  await createAuditLog({
    actorId: user.id,
    actorRole: "admin",
    entityType: "subject_milestone_template",
    entityId: template.id,
    action: "subject_milestone_template.updated",
    toState: parsed.isArchived ? "archived" : "active",
    metadata: { subjectId: template.subjectId, title: template.title },
  });

  revalidatePath(`/admin/subjects/${template.subjectId}`);
  redirect(`/admin/subjects/${template.subjectId}?saved=milestone`);
}

async function requireAdmin() {
  const user = await getCurrentUser();

  if (!user || user.role !== "admin") {
    throw new Error("Only admin accounts can manage subjects.");
  }

  return user;
}

async function getValidCriterionIdsForSubject(
  subjectId: string,
  rawCriterionIds: string[],
) {
  const uniqueCriterionIds = Array.from(new Set(rawCriterionIds.filter(Boolean)));

  if (uniqueCriterionIds.length === 0) {
    return [];
  }

  const criteria = await prisma.criterionDef.findMany({
    where: {
      id: { in: uniqueCriterionIds },
      subjectId,
    },
    select: { id: true },
  });
  const validCriterionIds = new Set(criteria.map((criterion) => criterion.id));

  return uniqueCriterionIds.filter((criterionId) =>
    validCriterionIds.has(criterionId),
  );
}
