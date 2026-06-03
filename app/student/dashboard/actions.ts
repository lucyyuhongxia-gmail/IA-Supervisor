"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit-log";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { ensureEnrollmentSubmissionSlots } from "@/lib/submissions";

export type JoinClassState = {
  error?: string;
  success?: string;
};

const joinClassSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .min(4, "Enter a valid invite code.")
    .transform((value) => value.toUpperCase()),
});

export async function joinClassAction(
  _state: JoinClassState,
  formData: FormData,
): Promise<JoinClassState> {
  const user = await getCurrentUser();

  if (!user) {
    return { error: "Sign in as a student to join a class." };
  }

  if (user.role !== "student") {
    return { error: "Only student accounts can join classes." };
  }

  const parsed = joinClassSchema.safeParse({
    inviteCode: formData.get("inviteCode"),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Check the invite code." };
  }

  const classRecord = await prisma.class.findUnique({
    where: { inviteCode: parsed.data.inviteCode },
    select: { id: true, name: true, isArchived: true },
  });

  if (!classRecord || classRecord.isArchived) {
    return { error: "No active class matches that invite code." };
  }

  const alreadyEnrolled = await prisma.enrollment.findUnique({
    where: {
      studentId_classId: {
        studentId: user.id,
        classId: classRecord.id,
      },
    },
    select: { id: true },
  });

  const enrollment = await prisma.enrollment.upsert({
    where: {
      studentId_classId: {
        studentId: user.id,
        classId: classRecord.id,
      },
    },
    update: {},
    create: {
      studentId: user.id,
      classId: classRecord.id,
    },
    select: { id: true },
  });

  await ensureEnrollmentSubmissionSlots({
    enrollmentId: enrollment.id,
    classId: classRecord.id,
  });

  if (!alreadyEnrolled) {
    await createAuditLog({
      actorId: user.id,
      actorRole: "student",
      entityType: "enrollment",
      entityId: enrollment.id,
      action: "enrollment.joined",
      toState: "joined",
      metadata: {
        classId: classRecord.id,
        inviteCodeUsed: parsed.data.inviteCode,
      },
    });
  }

  revalidatePath("/student/dashboard");

  if (alreadyEnrolled) {
    return { success: `You are already enrolled in ${classRecord.name}.` };
  }

  return { success: `Joined ${classRecord.name}. Submission slots are ready.` };
}
