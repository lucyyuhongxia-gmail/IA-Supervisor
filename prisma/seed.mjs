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

const subjectMilestoneTemplates = [
  { title: "Project proposal approved", criterionCode: null, sortOrder: 1 },
  { title: "Criterion A: Problem specification", criterionCode: "A", sortOrder: 2 },
  { title: "Criterion B: Planning", criterionCode: "B", sortOrder: 3 },
  { title: "Criterion C: System overview", criterionCode: "C", sortOrder: 4 },
  { title: "Criterion D: Development checkpoint", criterionCode: "D", sortOrder: 5 },
  { title: "Criterion E: Evaluation draft", criterionCode: "E", sortOrder: 6 },
  { title: "Final IA package ready", criterionCode: null, sortOrder: 7 },
];

const subjectDeliverableTemplates = [
  {
    title: "Criterion A document",
    description: "Problem specification document for Criterion A review.",
    fileRequirement: "PDF only",
    reviewMode: "single_criterion",
    criterionCodes: ["A"],
    sortOrder: 1,
  },
  {
    title: "Criterion B document",
    description: "Planning document for Criterion B review.",
    fileRequirement: "PDF only",
    reviewMode: "single_criterion",
    criterionCodes: ["B"],
    sortOrder: 2,
  },
  {
    title: "Criterion C document",
    description: "System overview document for Criterion C review.",
    fileRequirement: "PDF only",
    reviewMode: "single_criterion",
    criterionCodes: ["C"],
    sortOrder: 3,
  },
  {
    title: "Criterion D document",
    description: "Development document for Criterion D review.",
    fileRequirement: "PDF only",
    reviewMode: "single_criterion",
    criterionCodes: ["D"],
    sortOrder: 4,
  },
  {
    title: "5-minute video",
    description: "Video demonstration evidence used as part of Criterion D review.",
    fileRequirement: "Video file or video link",
    reviewMode: "single_criterion",
    criterionCodes: ["D"],
    sortOrder: 5,
  },
  {
    title: "Criterion E document",
    description: "Evaluation document for Criterion E review.",
    fileRequirement: "PDF only",
    reviewMode: "single_criterion",
    criterionCodes: ["E"],
    sortOrder: 6,
  },
  {
    title: "Final combined IA package",
    description: "Final combined submission package for archiving and final review.",
    fileRequirement: "PDF only",
    reviewMode: "final_package",
    criterionCodes: ["A", "B", "C", "D", "E"],
    sortOrder: 7,
  },
];

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const subject = await prisma.subject.upsert({
    where: { slug: "ib-computer-science-ia" },
    update: { name: "IB Computer Science IA", isArchived: false },
    create: {
      name: "IB Computer Science IA",
      slug: "ib-computer-science-ia",
    },
  });

  await prisma.subject.updateMany({
    where: {
      slug: "ib-computer-science",
      classes: { none: {} },
    },
    data: { isArchived: true },
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

  for (const template of subjectMilestoneTemplates) {
    const existingTemplate = await prisma.subjectMilestoneTemplate.findFirst({
      where: {
        subjectId: subject.id,
        title: template.title,
      },
      select: { id: true },
    });
    const data = {
      subjectId: subject.id,
      title: template.title,
      sortOrder: template.sortOrder,
      criterionId: template.criterionCode
        ? criteriaByCode.get(template.criterionCode)
        : null,
      isArchived: false,
    };

    if (existingTemplate) {
      await prisma.subjectMilestoneTemplate.update({
        where: { id: existingTemplate.id },
        data,
      });
    } else {
      await prisma.subjectMilestoneTemplate.create({ data });
    }
  }

  const seededDeliverableTemplates = [];

  for (const template of subjectDeliverableTemplates) {
    const existingTemplate = await prisma.subjectDeliverableTemplate.findFirst({
      where: {
        subjectId: subject.id,
        title: template.title,
      },
      select: { id: true },
    });
    const data = {
      subjectId: subject.id,
      title: template.title,
      description: template.description,
      fileRequirement: template.fileRequirement,
      reviewMode: template.reviewMode,
      sortOrder: template.sortOrder,
      isArchived: false,
    };
    const deliverableTemplate = existingTemplate
      ? await prisma.subjectDeliverableTemplate.update({
          where: { id: existingTemplate.id },
          data,
        })
      : await prisma.subjectDeliverableTemplate.create({ data });
    const criterionIds = template.criterionCodes
      .map((code) => criteriaByCode.get(code))
      .filter(Boolean);

    await prisma.subjectDeliverableTemplateCriterion.deleteMany({
      where: { templateId: deliverableTemplate.id },
    });

    for (const [index, criterionId] of criterionIds.entries()) {
      await prisma.subjectDeliverableTemplateCriterion.create({
        data: {
          templateId: deliverableTemplate.id,
          criterionId,
          sortOrder: index + 1,
        },
      });
    }

    seededDeliverableTemplates.push({
      ...deliverableTemplate,
      criterionIds,
    });
  }

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

  const existingSubjectClasses = await prisma.class.findMany({
    where: { subjectId: subject.id },
    include: {
      deliverables: { select: { id: true } },
    },
  });

  for (const classRecord of existingSubjectClasses) {
    if (classRecord.deliverables.length > 0) {
      continue;
    }

    for (const template of seededDeliverableTemplates) {
      await prisma.classDeliverable.create({
        data: {
          classId: classRecord.id,
          sourceTemplateId: template.id,
          title: template.title,
          description: template.description,
          fileRequirement: template.fileRequirement,
          reviewMode: template.reviewMode,
          sortOrder: template.sortOrder,
          criteria: {
            create: template.criterionIds.map((criterionId, index) => ({
              criterionId,
              sortOrder: index + 1,
            })),
          },
        },
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
          deliverables: {
            where: { isArchived: false },
            select: { id: true },
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

    for (const deliverable of enrollment.class.deliverables) {
      await prisma.deliverableSubmissionSlot.upsert({
        where: {
          enrollmentId_deliverableId: {
            enrollmentId: enrollment.id,
            deliverableId: deliverable.id,
          },
        },
        update: {},
        create: {
          enrollmentId: enrollment.id,
          deliverableId: deliverable.id,
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
