"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";

import { createAuditLog } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";

export type RegisterState = {
  error?: string;
  success?: true;
  role?: "teacher" | "student";
  redirectPath?: string;
};

const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name.").max(100),
    email: z.string().trim().email("Enter a valid email address."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Confirm your password."),
    role: z.enum(["teacher", "student"]),
    inviteCode: z.string().trim().optional(),
    teacherSignupCode: z.string().trim().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export async function registerAction(formData: FormData): Promise<RegisterState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    role: formData.get("role"),
    inviteCode: optionalFormString(formData.get("inviteCode")),
    teacherSignupCode: optionalFormString(formData.get("teacherSignupCode")),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.errors[0]?.message ?? "Check the registration form.",
    };
  }

  const data = parsed.data;
  const email = data.email.toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    return { error: "An account with this email already exists." };
  }

  if (data.role === "teacher") {
    const configuredCode = process.env.TEACHER_SIGNUP_CODE;

    if (!configuredCode) {
      return { error: "Teacher registration is not configured yet." };
    }

    if (data.teacherSignupCode !== configuredCode) {
      return { error: "Invalid teacher signup code." };
    }
  }

  let classRecord: {
    id: string;
    isArchived: boolean;
    subjectId: string;
  } | null = null;

  if (data.role === "student") {
    const inviteCode = data.inviteCode?.toUpperCase();

    if (!inviteCode) {
      return { error: "Enter the class invite code from your teacher." };
    }

    classRecord = await prisma.class.findUnique({
      where: { inviteCode },
      select: { id: true, isArchived: true, subjectId: true },
    });

    if (!classRecord || classRecord.isArchived) {
      return { error: "No active class matches that invite code." };
    }
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          name: data.name,
          role: data.role,
        },
        select: { id: true },
      });

      await createAuditLog(
        {
          actorId: user.id,
          actorRole: data.role,
          entityType: "user",
          entityId: user.id,
          action: "auth.user_registered",
          toState: "registered",
          metadata: {
            role: data.role,
          },
        },
        tx,
      );

      if (data.role === "student" && classRecord) {
        const enrollment = await tx.enrollment.create({
          data: {
            studentId: user.id,
            classId: classRecord.id,
          },
          select: { id: true },
        });

        await createAuditLog(
          {
            actorId: user.id,
            actorRole: data.role,
            entityType: "enrollment",
            entityId: enrollment.id,
            action: "enrollment.joined",
            toState: "joined",
            metadata: {
              classId: classRecord.id,
              inviteCodeUsed: data.inviteCode?.toUpperCase(),
              source: "registration",
            },
          },
          tx,
        );

        const criteria = await tx.criterionDef.findMany({
          where: { subjectId: classRecord.subjectId },
          select: { id: true },
        });
        const deliverables = await tx.classDeliverable.findMany({
          where: {
            classId: classRecord.id,
            isArchived: false,
          },
          select: { id: true },
        });

        if (criteria.length > 0) {
          await tx.submissionSlot.createMany({
            data: criteria.map((criterion) => ({
              enrollmentId: enrollment.id,
              criterionId: criterion.id,
            })),
            skipDuplicates: true,
          });
        }

        if (deliverables.length > 0) {
          await tx.deliverableSubmissionSlot.createMany({
            data: deliverables.map((deliverable) => ({
              enrollmentId: enrollment.id,
              deliverableId: deliverable.id,
            })),
            skipDuplicates: true,
          });
        }
      }
    });
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      return { error: "An account with this email already exists." };
    }

    return { error: "Could not create the account. Try again." };
  }

  return {
    success: true,
    role: data.role,
    redirectPath:
      data.role === "student" ? "/student/dashboard" : "/teacher/dashboard",
  };
}

function isPrismaUniqueError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function optionalFormString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : undefined;
}
