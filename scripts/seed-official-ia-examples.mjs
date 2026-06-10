import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const exampleRoot = path.resolve("docs/test/IA-example for 2027");
const subjectSlug = "ib-computer-science-ia";
const className = "IB CS IA 2027 Official Examples";
const classInviteCode = "IA2027X";
const defaultTeacherEmail = "lucy_yu@ulink.cn";
const fallbackTeacherEmail = "teacher@example.com";
const studentPassword = "password123";
const expectedExampleCount = 8;
const criterionCodes = ["A", "B", "C", "D", "E"];

async function main() {
  assertLocalDatabase();
  assertExampleRoot();

  const examples = await discoverExamples();
  const subject = await getSubject();
  const teacher = await getTeacher();
  const classRecord = await upsertExampleClass({
    subjectId: subject.id,
    teacherId: teacher.id,
  });

  await ensureClassDeliverables({
    classId: classRecord.id,
    subjectId: subject.id,
  });

  const criteria = await prisma.criterionDef.findMany({
    where: { subjectId: subject.id },
    orderBy: { sortOrder: "asc" },
    select: { id: true, code: true, title: true },
  });
  const criteriaByCode = new Map(criteria.map((criterion) => [criterion.code, criterion]));

  for (const code of criterionCodes) {
    if (!criteriaByCode.has(code)) {
      throw new Error(`Missing Criterion ${code} for subject ${subjectSlug}.`);
    }
  }

  const deliverables = await prisma.classDeliverable.findMany({
    where: { classId: classRecord.id, isArchived: false },
    include: {
      criteria: {
        select: {
          criterion: { select: { code: true } },
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const passwordHash = await bcrypt.hash(studentPassword, 10);
  const summary = {
    students: 0,
    criterionVersions: 0,
    deliverableVersions: 0,
    fileAssets: 0,
  };

  for (const example of examples) {
    const student = await upsertExampleStudent({
      exampleNumber: example.number,
      passwordHash,
    });
    const enrollment = await prisma.enrollment.upsert({
      where: {
        studentId_classId: {
          studentId: student.id,
          classId: classRecord.id,
        },
      },
      update: {},
      create: {
        studentId: student.id,
        classId: classRecord.id,
      },
      select: { id: true },
    });

    await ensureEnrollmentSlots({
      enrollmentId: enrollment.id,
      criteria,
      deliverables,
    });

    const seedResult = await seedExampleSubmissions({
      example,
      studentId: student.id,
      enrollmentId: enrollment.id,
      criteria,
      deliverables,
    });

    summary.students += 1;
    summary.criterionVersions += seedResult.criterionVersions;
    summary.deliverableVersions += seedResult.deliverableVersions;
    summary.fileAssets += seedResult.fileAssets;
  }

  console.log("Official IA example test data seeded.");
  console.log(`Class: ${className}`);
  console.log(`Invite code: ${classInviteCode}`);
  console.log(`Teacher: ${teacher.email}`);
  console.log(`Student password: ${studentPassword}`);
  console.log(`Students: ${summary.students}`);
  console.log(`Criterion versions: ${summary.criterionVersions}`);
  console.log(`Deliverable versions: ${summary.deliverableVersions}`);
  console.log(`File assets: ${summary.fileAssets}`);
}

function assertLocalDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const parsed = new URL(databaseUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

  if (!localHosts.has(parsed.hostname)) {
    throw new Error(`Refusing to seed non-local database host: ${parsed.hostname}`);
  }
}

function assertExampleRoot() {
  if (!existsSync(exampleRoot)) {
    throw new Error(
      `Official example directory not found: ${exampleRoot}. Add the IB example files before running this script.`,
    );
  }
}

async function discoverExamples() {
  const entries = await readdir(exampleRoot, { withFileTypes: true });
  const examples = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const numberMatch = entry.name.match(/(\d+)/);

    if (!numberMatch) {
      continue;
    }

    const number = Number(numberMatch[1]);
    const directory = path.join(exampleRoot, entry.name);
    const mainPdf = path.join(directory, `DP_Comp_sci_asw_example_${number}_en.pdf`);
    const appendixPdf = path.join(
      directory,
      `DP_Comp_sci_asw_appendix_example_${number}_en.pdf`,
    );
    const examinerCommentPdf = path.join(
      directory,
      `DP_Comp_sci_asw_examiner_comment_example_${number}_en.pdf`,
    );
    const video = path.join(directory, `DP_Comp_sci_asw_video_example_${number}_en.mp4`);

    for (const filePath of [mainPdf, appendixPdf, examinerCommentPdf, video]) {
      if (!existsSync(filePath)) {
        throw new Error(`Missing official example file: ${filePath}`);
      }
    }

    examples.push({
      number,
      directory,
      mainPdf,
      appendixPdf,
      examinerCommentPdf,
      video,
    });
  }

  examples.sort((left, right) => left.number - right.number);

  if (examples.length !== expectedExampleCount) {
    throw new Error(
      `Expected ${expectedExampleCount} official examples, found ${examples.length}.`,
    );
  }

  return examples;
}

async function getSubject() {
  const subject = await prisma.subject.findUnique({
    where: { slug: subjectSlug },
    select: { id: true, slug: true },
  });

  if (!subject) {
    throw new Error(`Subject template not found: ${subjectSlug}. Run npx prisma db seed first.`);
  }

  return subject;
}

async function getTeacher() {
  const teacherEmail = process.env.OFFICIAL_EXAMPLES_TEACHER_EMAIL ?? defaultTeacherEmail;
  const teacher =
    (await prisma.user.findUnique({
      where: { email: teacherEmail },
      select: { id: true, email: true, role: true },
    })) ??
    (await prisma.user.findUnique({
      where: { email: fallbackTeacherEmail },
      select: { id: true, email: true, role: true },
    }));

  if (!teacher || teacher.role !== "teacher") {
    throw new Error(
      `Teacher user not found. Create ${teacherEmail} or ${fallbackTeacherEmail} first.`,
    );
  }

  return teacher;
}

async function upsertExampleClass({ subjectId, teacherId }) {
  const existing = await prisma.class.findFirst({
    where: {
      name: className,
      subjectId,
      teacherId,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.class.update({
      where: { id: existing.id },
      data: {
        examSession: "May 2027",
        inviteCode: classInviteCode,
        isArchived: false,
      },
      select: { id: true },
    });
  }

  return prisma.class.create({
    data: {
      name: className,
      examSession: "May 2027",
      inviteCode: classInviteCode,
      subjectId,
      teacherId,
    },
    select: { id: true },
  });
}

async function ensureClassDeliverables({ classId, subjectId }) {
  const templates = await prisma.subjectDeliverableTemplate.findMany({
    where: {
      subjectId,
      isArchived: false,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      criteria: {
        orderBy: { sortOrder: "asc" },
        select: { criterionId: true, sortOrder: true },
      },
    },
  });

  for (const template of templates) {
    await prisma.classDeliverable.upsert({
      where: {
        classId_sourceTemplateId: {
          classId,
          sourceTemplateId: template.id,
        },
      },
      update: {
        title: template.title,
        description: template.description,
        fileRequirement: template.fileRequirement,
        reviewMode: template.reviewMode,
        sortOrder: template.sortOrder,
        isArchived: false,
      },
      create: {
        classId,
        sourceTemplateId: template.id,
        title: template.title,
        description: template.description,
        fileRequirement: template.fileRequirement,
        reviewMode: template.reviewMode,
        sortOrder: template.sortOrder,
        criteria: {
          create: template.criteria.map((link, index) => ({
            criterionId: link.criterionId,
            sortOrder: link.sortOrder || index + 1,
          })),
        },
      },
    });
  }
}

async function upsertExampleStudent({ exampleNumber, passwordHash }) {
  const email = `official-example-${exampleNumber}@student.test`;

  return prisma.user.upsert({
    where: { email },
    update: {
      name: `Official Example ${exampleNumber}`,
      role: "student",
      passwordHash,
    },
    create: {
      email,
      name: `Official Example ${exampleNumber}`,
      role: "student",
      passwordHash,
    },
    select: { id: true, email: true },
  });
}

async function ensureEnrollmentSlots({ enrollmentId, criteria, deliverables }) {
  for (const criterion of criteria) {
    await prisma.submissionSlot.upsert({
      where: {
        enrollmentId_criterionId: {
          enrollmentId,
          criterionId: criterion.id,
        },
      },
      update: {},
      create: {
        enrollmentId,
        criterionId: criterion.id,
      },
    });
  }

  for (const deliverable of deliverables) {
    await prisma.deliverableSubmissionSlot.upsert({
      where: {
        enrollmentId_deliverableId: {
          enrollmentId,
          deliverableId: deliverable.id,
        },
      },
      update: {},
      create: {
        enrollmentId,
        deliverableId: deliverable.id,
      },
    });
  }
}

async function seedExampleSubmissions({
  example,
  studentId,
  enrollmentId,
  criteria,
  deliverables,
}) {
  let criterionVersions = 0;
  let deliverableVersions = 0;
  let fileAssets = 0;
  const submittedAt = new Date(Date.UTC(2026, 5, example.number, 8, 0, 0));
  const examinerCommentRelativePath = path.relative(process.cwd(), example.examinerCommentPdf);

  for (const criterion of criteria) {
    const slot = await prisma.submissionSlot.findUniqueOrThrow({
      where: {
        enrollmentId_criterionId: {
          enrollmentId,
          criterionId: criterion.id,
        },
      },
      select: { id: true },
    });
    const files =
      criterion.code === "D"
        ? [example.mainPdf, example.appendixPdf]
        : [example.mainPdf];

    const result = await replaceCriterionVersion({
      slotId: slot.id,
      studentId,
      criterionCode: criterion.code,
      exampleNumber: example.number,
      submittedAt,
      files,
      notes: `Official IA example ${example.number}. Examiner comment: ${examinerCommentRelativePath}`,
    });

    criterionVersions += 1;
    fileAssets += result.fileAssets;
  }

  for (const deliverable of deliverables) {
    const slot = await prisma.deliverableSubmissionSlot.findUniqueOrThrow({
      where: {
        enrollmentId_deliverableId: {
          enrollmentId,
          deliverableId: deliverable.id,
        },
      },
      select: { id: true },
    });
    const evidence = getDeliverableEvidence({
      deliverable,
      example,
    });

    const result = await replaceDeliverableVersion({
      slotId: slot.id,
      studentId,
      submittedAt,
      files: evidence.files,
      artifactUrl: evidence.artifactUrl,
      notes: `Official IA example ${example.number}. Examiner comment: ${examinerCommentRelativePath}`,
    });

    deliverableVersions += 1;
    fileAssets += result.fileAssets;
  }

  return {
    criterionVersions,
    deliverableVersions,
    fileAssets,
  };
}

function getDeliverableEvidence({ deliverable, example }) {
  const title = deliverable.title.toLowerCase();
  const fileRequirement = deliverable.fileRequirement?.toLowerCase() ?? "";

  if (title.includes("5-minute video") || fileRequirement.includes("video")) {
    return {
      files: [example.video],
      artifactUrl: null,
    };
  }

  if (title.includes("final combined")) {
    return {
      files: [example.mainPdf, example.appendixPdf],
      artifactUrl: null,
    };
  }

  if (title.includes("criterion d")) {
    return {
      files: [example.mainPdf, example.appendixPdf],
      artifactUrl: null,
    };
  }

  return {
    files: [example.mainPdf],
    artifactUrl: null,
  };
}

async function replaceCriterionVersion({
  slotId,
  studentId,
  criterionCode,
  exampleNumber,
  submittedAt,
  files,
  notes,
}) {
  return prisma.$transaction(async (tx) => {
    await clearCriterionReviewArtifacts(tx, slotId);
    await tx.submissionSlot.update({
      where: { id: slotId },
      data: {
        latestVersionId: null,
      },
    });
    await tx.fileAsset.deleteMany({
      where: { submissionSlotId: slotId },
    });
    await tx.submissionVersion.deleteMany({
      where: { submissionSlotId: slotId },
    });

    const version = await tx.submissionVersion.create({
      data: {
        submissionSlotId: slotId,
        versionNumber: 1,
        draftTitle: `Official example ${exampleNumber} Criterion ${criterionCode}`,
        notes,
        submittedAt,
        fileAssets: {
          create: await Promise.all(
            files.map((filePath) =>
              buildFileAsset({
                filePath,
                ownerId: studentId,
                submissionSlotId: slotId,
              }),
            ),
          ),
        },
      },
      include: { fileAssets: { select: { id: true } } },
    });

    await tx.submissionSlot.update({
      where: { id: slotId },
      data: {
        latestVersionId: version.id,
        status: "submitted",
        draftTitle: null,
        artifactUrl: null,
        notes: null,
        teacherFeedback: null,
        reviewedAt: null,
        submittedAt,
      },
    });

    return { fileAssets: version.fileAssets.length };
  });
}

async function clearCriterionReviewArtifacts(tx, slotId) {
  await tx.deltaReview.deleteMany({
    where: { submissionSlotId: slotId },
  });
  await tx.markingSnapshot.deleteMany({
    where: { submissionSlotId: slotId },
  });
  await tx.feedbackSnapshot.deleteMany({
    where: { submissionSlotId: slotId },
  });
  await tx.semanticExtraction.deleteMany({
    where: { submissionSlotId: slotId },
  });
  await tx.aIReviewFinding.deleteMany({
    where: {
      aiReviewRun: {
        submissionSlotId: slotId,
      },
    },
  });
  await tx.aIReviewRun.deleteMany({
    where: { submissionSlotId: slotId },
  });
}

async function replaceDeliverableVersion({
  slotId,
  studentId,
  submittedAt,
  files,
  artifactUrl,
  notes,
}) {
  return prisma.$transaction(async (tx) => {
    await tx.deliverableSubmissionSlot.update({
      where: { id: slotId },
      data: {
        latestVersionId: null,
      },
    });
    await tx.fileAsset.deleteMany({
      where: { deliverableSubmissionSlotId: slotId },
    });
    await tx.deliverableSubmissionVersion.deleteMany({
      where: { deliverableSubmissionSlotId: slotId },
    });

    const version = await tx.deliverableSubmissionVersion.create({
      data: {
        deliverableSubmissionSlotId: slotId,
        versionNumber: 1,
        artifactUrl,
        notes,
        submittedAt,
        fileAssets: {
          create: await Promise.all(
            files.map((filePath) =>
              buildFileAsset({
                filePath,
                ownerId: studentId,
                deliverableSubmissionSlotId: slotId,
              }),
            ),
          ),
        },
      },
      include: { fileAssets: { select: { id: true } } },
    });

    await tx.deliverableSubmissionSlot.update({
      where: { id: slotId },
      data: {
        latestVersionId: version.id,
        status: "submitted",
        artifactUrl,
        notes: null,
        teacherFeedback: null,
        reviewedAt: null,
        submittedAt,
      },
    });

    return { fileAssets: version.fileAssets.length };
  });
}

async function buildFileAsset({
  filePath,
  ownerId,
  submissionSlotId,
  deliverableSubmissionSlotId,
}) {
  const fileStats = await stat(filePath);
  const originalName = path.basename(filePath);
  const extension = path.extname(originalName).toLowerCase();

  return {
    submissionSlotId,
    deliverableSubmissionSlotId,
    ownerId,
    originalName,
    storedName: `official-example-${originalName}`,
    storagePath: filePath,
    mimeType: extension === ".mp4" ? "video/mp4" : "application/pdf",
    sizeBytes: Number(fileStats.size),
  };
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
