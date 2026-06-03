import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

const criteria = [
  {
    code: "A",
    title: "Problem specification",
    description: "Defines the problem, context, client or end user needs, and success criteria.",
    maxMarks: 4,
    sortOrder: 1,
  },
  {
    code: "B",
    title: "Planning",
    description: "Documents the proposed solution plan, design approach, and project organization.",
    maxMarks: 4,
    sortOrder: 2,
  },
  {
    code: "C",
    title: "System overview",
    description: "Explains the system design, structure, and how the solution components work together.",
    maxMarks: 6,
    sortOrder: 3,
  },
  {
    code: "D",
    title: "Development",
    description: "Explains implementation, techniques, testing evidence, and development decisions.",
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

const users = [
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

const milestoneTitleUpdates = [
  ["Criterion A: Planning", "Criterion A: Problem specification"],
  ["Criterion B: Solution overview", "Criterion B: Planning"],
  ["Criterion C: Development checkpoint", "Criterion C: System overview"],
  ["Criterion D: Functionality review", "Criterion D: Development checkpoint"],
];

const milestoneCriterionLinks = [
  ["Criterion A: Problem specification", "A"],
  ["Criterion B: Planning", "B"],
  ["Criterion C: System overview", "C"],
  ["Criterion D: Development checkpoint", "D"],
  ["Criterion E: Evaluation draft", "E"],
];

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const subject = await prisma.subject.upsert({
    where: { slug: "ib-computer-science" },
    update: { name: "IB Computer Science" },
    create: {
      name: "IB Computer Science",
      slug: "ib-computer-science",
    },
  });

  const assessmentReference = await prisma.assessmentReference.upsert({
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
          assessmentReferenceId: assessmentReference.id,
          fileName: file.fileName,
        },
      },
      update: {
        label: file.label,
        storagePath: file.storagePath,
      },
      create: {
        assessmentReferenceId: assessmentReference.id,
        ...file,
      },
    });
  }

  await prisma.subject.update({
    where: { id: subject.id },
    data: { activeAssessmentReferenceId: assessmentReference.id },
  });

  for (const criterion of criteria) {
    await prisma.criterionDef.upsert({
      where: {
        subjectId_code: {
          subjectId: subject.id,
          code: criterion.code,
        },
      },
      update: criterion,
      create: {
        ...criterion,
        subjectId: subject.id,
      },
    });
  }

  const seededCriteria = await prisma.criterionDef.findMany({
    where: { subjectId: subject.id },
    select: { id: true, code: true },
  });
  const criteriaByCode = new Map(
    seededCriteria.map((criterion) => [criterion.code, criterion.id]),
  );

  for (const [oldTitle, newTitle] of milestoneTitleUpdates) {
    await prisma.milestone.updateMany({
      where: { title: oldTitle },
      data: { title: newTitle },
    });
  }

  for (const [title, criterionCode] of milestoneCriterionLinks) {
    const criterionId = criteriaByCode.get(criterionCode);

    if (criterionId) {
      await prisma.milestone.updateMany({
        where: {
          title,
          class: {
            subjectId: subject.id,
          },
        },
        data: { criterionId },
      });
    }
  }

  for (const user of users) {
    await prisma.user.upsert({
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
    });
  }

  const enrollments = await prisma.enrollment.findMany({
    include: {
      class: {
        include: {
          subject: {
            include: {
              criteria: true,
            },
          },
        },
      },
    },
  });

  for (const enrollment of enrollments) {
    for (const criterion of enrollment.class.subject.criteria) {
      await prisma.submissionSlot.upsert({
        where: {
          enrollmentId_criterionId: {
            enrollmentId: enrollment.id,
            criterionId: criterion.id,
          },
        },
        update: {},
        create: {
          enrollmentId: enrollment.id,
          criterionId: criterion.id,
        },
      });
    }
  }

  const submittedSlots = await prisma.submissionSlot.findMany({
    where: {
      versions: { none: {} },
      OR: [
        { submittedAt: { not: null } },
        { fileAssets: { some: {} } },
      ],
    },
    include: {
      fileAssets: true,
    },
  });

  for (const slot of submittedSlots) {
    const version = await prisma.submissionVersion.create({
      data: {
        submissionSlotId: slot.id,
        versionNumber: 1,
        draftTitle: slot.draftTitle,
        notes: slot.notes,
        teacherFeedback: slot.teacherFeedback,
        reviewedAt: slot.reviewedAt,
        submittedAt: slot.submittedAt ?? slot.createdAt,
      },
      select: { id: true },
    });

    await prisma.fileAsset.updateMany({
      where: {
        submissionSlotId: slot.id,
        submissionVersionId: null,
      },
      data: {
        submissionVersionId: version.id,
      },
    });

    await prisma.submissionSlot.update({
      where: { id: slot.id },
      data: { latestVersionId: version.id },
    });
  }

  console.log("Seeded IB CS criteria and demo users.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
