import { readFile, writeFile } from "fs/promises";
import path from "path";

import { prisma } from "@/lib/prisma";

export const DEFAULT_REFERENCE_KEY = "ib-cs-ia-2027";
export const REFERENCE_FILES = ["criteria.md", "rubric.md", "prompt-guidance.md"] as const;

export type AssessmentReferenceFileName = (typeof REFERENCE_FILES)[number];

export type AssessmentReference = {
  key: string;
  sourcePath: string;
  content: string;
};

export type AssessmentReferenceFile = {
  fileName: AssessmentReferenceFileName;
  content: string;
};

export type SubjectAssessmentReference = {
  id: string;
  key: string;
  title: string;
  description: string | null;
  subjectId: string;
  subjectName: string;
};

export async function getAssessmentReference(
  key = DEFAULT_REFERENCE_KEY,
): Promise<AssessmentReference> {
  const sourcePath = getAssessmentReferencePath(key);

  const sections = await Promise.all(
    REFERENCE_FILES.map(async (fileName) => {
      const content = await readFile(path.join(sourcePath, fileName), "utf8");

      return `# ${fileName}\n\n${content.trim()}`;
    }),
  );

  return {
    key,
    sourcePath,
    content: sections.join("\n\n---\n\n"),
  };
}

export async function getAssessmentReferenceForSubject(
  subjectId: string,
): Promise<AssessmentReference & { metadata: SubjectAssessmentReference }> {
  const reference = await getSubjectActiveAssessmentReference(subjectId);
  const content = await getAssessmentReference(reference.key);

  return {
    ...content,
    metadata: reference,
  };
}

export async function getSubjectActiveAssessmentReference(
  subjectId: string,
): Promise<SubjectAssessmentReference> {
  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    include: {
      activeAssessmentReference: true,
      assessmentReferences: {
        where: { isArchived: false },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!subject) {
    throw new Error("Subject not found for assessment reference.");
  }

  const reference =
    subject.activeAssessmentReference ?? subject.assessmentReferences[0];

  if (!reference) {
    throw new Error(
      `No active assessment reference configured for ${subject.name}.`,
    );
  }

  return {
    id: reference.id,
    key: reference.key,
    title: reference.title,
    description: reference.description,
    subjectId: subject.id,
    subjectName: subject.name,
  };
}

export async function getAdminAssessmentReferenceOverview() {
  return prisma.subject.findMany({
    orderBy: { name: "asc" },
    include: {
      activeAssessmentReference: {
        include: {
          files: { orderBy: { fileName: "asc" } },
        },
      },
      assessmentReferences: {
        orderBy: { createdAt: "desc" },
        include: {
          files: { orderBy: { fileName: "asc" } },
        },
      },
    },
  });
}

export async function getAssessmentReferenceFiles(
  key = DEFAULT_REFERENCE_KEY,
): Promise<AssessmentReferenceFile[]> {
  const sourcePath = getAssessmentReferencePath(key);

  return Promise.all(
    REFERENCE_FILES.map(async (fileName) => ({
      fileName,
      content: await readFile(path.join(sourcePath, fileName), "utf8"),
    })),
  );
}

export async function updateAssessmentReferenceFile({
  key = DEFAULT_REFERENCE_KEY,
  fileName,
  content,
}: {
  key?: string;
  fileName: AssessmentReferenceFileName;
  content: string;
}) {
  const sourcePath = getAssessmentReferencePath(key);

  await writeFile(path.join(sourcePath, fileName), content, "utf8");
  await prisma.assessmentReferenceFile.updateMany({
    where: {
      fileName,
      assessmentReference: {
        key,
      },
    },
    data: {
      updatedAt: new Date(),
    },
  });
}

function getAssessmentReferencePath(key: string) {
  return path.join(process.cwd(), "docs", "assessment", key);
}
