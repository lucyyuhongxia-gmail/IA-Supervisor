"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  DEFAULT_REFERENCE_KEY,
  REFERENCE_FILES,
  updateAssessmentReferenceFile,
} from "@/lib/assessment-reference";
import { createAuditLog } from "@/lib/audit-log";
import { getCurrentUser } from "@/lib/current-user";

const updateAssessmentReferenceSchema = z.object({
  fileName: z.enum(REFERENCE_FILES),
  content: z.string().trim().min(20, "Reference content is too short."),
});

export async function updateAssessmentReferenceAction(formData: FormData) {
  const user = await getCurrentUser();

  if (!user || user.role !== "admin") {
    throw new Error("Only admin accounts can update assessment references.");
  }

  const parsed = updateAssessmentReferenceSchema.parse({
    fileName: formData.get("fileName"),
    content: formData.get("content"),
  });

  await updateAssessmentReferenceFile({
    key: DEFAULT_REFERENCE_KEY,
    fileName: parsed.fileName,
    content: `${parsed.content}\n`,
  });

  await createAuditLog({
    actorId: user.id,
    actorRole: "admin",
    entityType: "assessment_reference",
    entityId: `${DEFAULT_REFERENCE_KEY}:${parsed.fileName}`,
    action: "assessment_reference.updated",
    toState: "updated",
    metadata: {
      referenceKey: DEFAULT_REFERENCE_KEY,
      fileName: parsed.fileName,
      contentLength: parsed.content.length,
    },
  });

  revalidatePath("/admin/assessment");
  redirect(`/admin/assessment?saved=${encodeURIComponent(parsed.fileName)}`);
}
