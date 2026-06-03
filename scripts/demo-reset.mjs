import { readdir, unlink } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const demoPassword = "password123";
const subjectSlug = "ib-computer-science";
const demoInviteCode = "LUCYIA";

const users = [
  {
    email: "lucy_yu@ulink.cn",
    name: "Lucy Yu",
    role: "teacher",
  },
  {
    email: "teacher@example.com",
    name: "Demo Teacher",
    role: "teacher",
  },
  {
    email: "student@example.com",
    name: "Demo Student",
    role: "student",
  },
  {
    email: "admin@example.com",
    name: "Demo Admin",
    role: "admin",
  },
];

const criteria = [
  {
    code: "A",
    title: "Problem specification",
    description:
      "Defines the problem, context, client or end user needs, and success criteria.",
    maxMarks: 4,
    sortOrder: 1,
  },
  {
    code: "B",
    title: "Planning",
    description:
      "Documents the proposed solution plan, design approach, and project organization.",
    maxMarks: 4,
    sortOrder: 2,
  },
  {
    code: "C",
    title: "System overview",
    description:
      "Explains the system design, structure, and how the solution components work together.",
    maxMarks: 6,
    sortOrder: 3,
  },
  {
    code: "D",
    title: "Development",
    description:
      "Explains implementation, techniques, testing evidence, and development decisions.",
    maxMarks: 12,
    sortOrder: 4,
  },
  {
    code: "E",
    title: "Evaluation",
    description: "Evaluates success against criteria and reflects on improvements.",
    maxMarks: 4,
    sortOrder: 5,
  },
];

const assessmentReferenceFiles = [
  {
    fileName: "criteria.md",
    label: "Criteria",
    storagePath: "docs/assessment/ib-cs-ia-2027/criteria.md",
  },
  {
    fileName: "rubric.md",
    label: "Rubric summary",
    storagePath: "docs/assessment/ib-cs-ia-2027/rubric.md",
  },
  {
    fileName: "prompt-guidance.md",
    label: "Prompt guidance",
    storagePath: "docs/assessment/ib-cs-ia-2027/prompt-guidance.md",
  },
];

const milestones = [
  { title: "Project proposal approved", criterionCode: null, daysFromNow: 7 },
  { title: "Criterion A: Problem specification", criterionCode: "A", daysFromNow: 21 },
  { title: "Criterion B: Planning", criterionCode: "B", daysFromNow: 42 },
  { title: "Criterion C: System overview", criterionCode: "C", daysFromNow: 63 },
  { title: "Criterion D: Development checkpoint", criterionCode: "D", daysFromNow: 84 },
  { title: "Criterion E: Evaluation draft", criterionCode: "E", daysFromNow: 105 },
  { title: "Final IA package ready", criterionCode: null, daysFromNow: 126 },
];

async function main() {
  assertLocalDatabase();

  await clearWorkflowData();
  await clearUploads();

  const passwordHash = await bcrypt.hash(demoPassword, 10);
  const subject = await seedSubject();
  const seededCriteria = await seedCriteria(subject.id);
  const userMap = await seedUsers(passwordHash);
  const lucy = userMap.get("lucy_yu@ulink.cn");
  const student = userMap.get("student@example.com");

  if (!lucy || !student) {
    throw new Error("Demo users were not created correctly.");
  }

  const classRecord = await createDemoClass({
    subjectId: subject.id,
    teacherId: lucy.id,
    criteriaByCode: new Map(
      seededCriteria.map((criterion) => [criterion.code, criterion.id]),
    ),
  });
  const enrollment = await prisma.enrollment.create({
    data: {
      classId: classRecord.id,
      studentId: student.id,
    },
    select: { id: true },
  });

  for (const criterion of seededCriteria) {
    await prisma.submissionSlot.create({
      data: {
        enrollmentId: enrollment.id,
        criterionId: criterion.id,
      },
    });
  }

  console.log("Demo reset complete.");
  console.log(`Teacher: lucy_yu@ulink.cn / ${demoPassword}`);
  console.log(`Student: student@example.com / ${demoPassword}`);
  console.log(`Admin: admin@example.com / ${demoPassword}`);
  console.log(`Class invite code: ${demoInviteCode}`);
}

function assertLocalDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const parsed = new URL(databaseUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

  if (!localHosts.has(parsed.hostname)) {
    throw new Error(
      `Refusing to reset non-local database host: ${parsed.hostname}`,
    );
  }
}

async function clearWorkflowData() {
  await prisma.$transaction([
    prisma.deltaReview.deleteMany(),
    prisma.markingSnapshot.deleteMany(),
    prisma.consistencyCheck.deleteMany(),
    prisma.feedbackSnapshot.deleteMany(),
    prisma.semanticExtraction.deleteMany(),
    prisma.aIReviewFinding.deleteMany(),
    prisma.aIReviewRun.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.fileAsset.deleteMany(),
    prisma.submissionSlot.updateMany({
      data: { latestVersionId: null },
    }),
    prisma.submissionVersion.deleteMany(),
    prisma.submissionSlot.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.milestone.deleteMany(),
    prisma.class.deleteMany(),
  ]);
}

async function clearUploads() {
  const uploadRoot = path.join(process.cwd(), "uploads");
  const entries = await readdir(uploadRoot, { withFileTypes: true }).catch(() => []);

  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name !== ".gitkeep")
      .map((entry) => unlink(path.join(uploadRoot, entry.name))),
  );
}

async function seedSubject() {
  const subject = await prisma.subject.upsert({
    where: { slug: subjectSlug },
    update: { name: "IB Computer Science" },
    create: {
      name: "IB Computer Science",
      slug: subjectSlug,
    },
  });
  const reference = await prisma.assessmentReference.upsert({
    where: { key: "ib-cs-ia-2027" },
    update: {
      subjectId: subject.id,
      title: "IB Computer Science IA 2027",
      description: "New syllabus IA assessment reference for AI review.",
      isArchived: false,
    },
    create: {
      subjectId: subject.id,
      key: "ib-cs-ia-2027",
      title: "IB Computer Science IA 2027",
      description: "New syllabus IA assessment reference for AI review.",
    },
  });

  for (const file of assessmentReferenceFiles) {
    await prisma.assessmentReferenceFile.upsert({
      where: {
        assessmentReferenceId_fileName: {
          assessmentReferenceId: reference.id,
          fileName: file.fileName,
        },
      },
      update: {
        label: file.label,
        storagePath: file.storagePath,
      },
      create: {
        assessmentReferenceId: reference.id,
        ...file,
      },
    });
  }

  return prisma.subject.update({
    where: { id: subject.id },
    data: { activeAssessmentReferenceId: reference.id },
  });
}

async function seedCriteria(subjectId) {
  for (const criterion of criteria) {
    await prisma.criterionDef.upsert({
      where: {
        subjectId_code: {
          subjectId,
          code: criterion.code,
        },
      },
      update: criterion,
      create: {
        ...criterion,
        subjectId,
      },
    });
  }

  return prisma.criterionDef.findMany({
    where: { subjectId },
    orderBy: { sortOrder: "asc" },
    select: { id: true, code: true },
  });
}

async function seedUsers(passwordHash) {
  const userMap = new Map();

  for (const user of users) {
    const record = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        role: user.role,
        passwordHash,
      },
      create: {
        ...user,
        passwordHash,
      },
      select: { id: true, email: true },
    });

    userMap.set(record.email, record);
  }

  return userMap;
}

async function createDemoClass({ subjectId, teacherId, criteriaByCode }) {
  return prisma.class.create({
    data: {
      name: "IB CS IA Demo",
      examSession: "May 2027",
      inviteCode: demoInviteCode,
      subjectId,
      teacherId,
      milestones: {
        create: milestones.map((milestone, index) => ({
          title: milestone.title,
          sortOrder: index + 1,
          criterionId: milestone.criterionCode
            ? criteriaByCode.get(milestone.criterionCode)
            : undefined,
          dueDate: addDays(new Date(), milestone.daysFromNow),
        })),
      },
    },
    select: { id: true },
  });
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  nextDate.setHours(0, 0, 0, 0);

  return nextDate;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
