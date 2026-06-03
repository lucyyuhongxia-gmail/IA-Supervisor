import type { FileAsset, Prisma, UserRole } from "@prisma/client";

import { createAuditLog } from "@/lib/audit-log";
import { extractFileText } from "@/lib/file-extraction";
import { prisma } from "@/lib/prisma";

type DeltaReviewItem = {
  issue: string;
  status: "possibly_addressed" | "still_needs_review";
  evidence: string[];
  teacherAction: string;
};

type NewEvidenceItem = {
  label: string;
  evidence: string;
  teacherAction: string;
};

const maxIssueCount = 8;
const maxEvidenceCount = 5;
const maxTextCharacters = 30000;

const stopWords = new Set([
  "about",
  "after",
  "again",
  "against",
  "also",
  "because",
  "before",
  "being",
  "between",
  "could",
  "criterion",
  "criteria",
  "document",
  "does",
  "each",
  "from",
  "have",
  "into",
  "more",
  "must",
  "only",
  "should",
  "some",
  "student",
  "submission",
  "than",
  "that",
  "their",
  "there",
  "these",
  "this",
  "with",
  "without",
  "would",
]);

export async function runDeltaReviewForSlot({
  classId,
  slotId,
  requestedById,
  actorRole,
}: {
  classId: string;
  slotId: string;
  requestedById: string;
  actorRole: UserRole;
}) {
  const slot = await prisma.submissionSlot.findFirst({
    where: {
      id: slotId,
      enrollment: {
        classId,
        class: { teacherId: requestedById },
      },
    },
    include: {
      criterion: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 2,
        include: {
          fileAssets: { orderBy: { createdAt: "desc" } },
          feedbackSnapshots: {
            where: { status: { in: ["sent", "superseded"] } },
            orderBy: [{ sentAt: "desc" }, { updatedAt: "desc" }],
          },
        },
      },
    },
  });

  if (!slot) {
    return { error: "Submission slot not found." };
  }

  const [currentVersion, previousVersion] = slot.versions;

  if (!currentVersion || !previousVersion) {
    return {
      error:
        "Delta review needs at least two submitted versions for this criterion.",
    };
  }

  const previousFeedback =
    previousVersion.feedbackSnapshots.find((snapshot) => snapshot.status === "sent")
      ?.content ??
    previousVersion.teacherFeedback ??
    "";

  if (!previousFeedback.trim()) {
    return {
      error:
        "Delta review needs teacher feedback on the previous version before it can compare changes.",
    };
  }

  const [currentContext, previousContext] = await Promise.all([
    extractVersionText(currentVersion.fileAssets),
    extractVersionText(previousVersion.fileAssets),
  ]);
  const feedbackIssues = parseFeedbackIssues(previousFeedback);

  if (feedbackIssues.length === 0) {
    return {
      error:
        "No clear feedback issues were found in the previous version feedback.",
    };
  }

  const items = feedbackIssues.map((issue) =>
    evaluateIssueAgainstCurrentText(issue, currentContext.text),
  );
  const resolved = items.filter((item) => item.status === "possibly_addressed");
  const remaining = items.filter((item) => item.status === "still_needs_review");
  const newEvidence = findNewEvidence({
    currentText: currentContext.text,
    previousText: previousContext.text,
    studentNote: currentVersion.notes,
  });
  const confidence = getConfidence({
    currentCharacterCount: currentContext.characterCount,
    previousCharacterCount: previousContext.characterCount,
    issueCount: feedbackIssues.length,
  });
  const summary = buildSummary({
    currentVersionNumber: currentVersion.versionNumber,
    previousVersionNumber: previousVersion.versionNumber,
    resolvedCount: resolved.length,
    remainingCount: remaining.length,
    newEvidenceCount: newEvidence.length,
    confidence,
  });

  const deltaReview = await prisma.$transaction(async (tx) => {
    const review = await tx.deltaReview.create({
      data: {
        submissionSlotId: slot.id,
        previousVersionId: previousVersion.id,
        currentVersionId: currentVersion.id,
        criterionId: slot.criterionId,
        requestedById,
        summary,
        confidence,
        resolvedJson: resolved as unknown as Prisma.InputJsonValue,
        remainingJson: remaining as unknown as Prisma.InputJsonValue,
        newEvidenceJson: newEvidence as unknown as Prisma.InputJsonValue,
        sourceJson: {
          schemaVersion: "1.0",
          reviewType: "delta_review",
          criterion: {
            id: slot.criterion.id,
            code: slot.criterion.code,
            title: slot.criterion.title,
          },
          previousVersion: {
            id: previousVersion.id,
            versionNumber: previousVersion.versionNumber,
            submittedAt: previousVersion.submittedAt.toISOString(),
            feedbackCharacterCount: previousFeedback.length,
            sourceCharacterCount: previousContext.characterCount,
            extractionDiagnostics: previousContext.diagnostics,
          },
          currentVersion: {
            id: currentVersion.id,
            versionNumber: currentVersion.versionNumber,
            submittedAt: currentVersion.submittedAt.toISOString(),
            sourceCharacterCount: currentContext.characterCount,
            extractionDiagnostics: currentContext.diagnostics,
          },
        } satisfies Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    await createAuditLog(
      {
        actorId: requestedById,
        actorRole,
        entityType: "submission_slot",
        entityId: slot.id,
        action: "delta_review.completed",
        toState: "completed",
        metadata: {
          classId,
          criterionId: slot.criterionId,
          deltaReviewId: review.id,
          previousVersionId: previousVersion.id,
          currentVersionId: currentVersion.id,
          previousVersionNumber: previousVersion.versionNumber,
          currentVersionNumber: currentVersion.versionNumber,
          resolvedCount: resolved.length,
          remainingCount: remaining.length,
          newEvidenceCount: newEvidence.length,
          confidence,
        },
      },
      tx,
    );

    return review;
  });

  return {
    success: "Delta review completed.",
    deltaReviewId: deltaReview.id,
  };
}

async function extractVersionText(files: FileAsset[]) {
  const diagnostics: {
    fileName: string;
    status: "success" | "limited";
    characterCount: number;
    message?: string;
  }[] = [];
  const parts = await Promise.all(
    files.map(async (file) => {
      const extraction = await extractFileText(file);
      diagnostics.push({
        fileName: file.originalName,
        status: extraction.status,
        characterCount: extraction.characterCount,
        message: extraction.message,
      });

      return extraction.status === "success" ? extraction.text : "";
    }),
  );
  const text = parts.filter(Boolean).join("\n\n").slice(0, maxTextCharacters);

  return {
    text,
    diagnostics,
    characterCount: diagnostics.reduce(
      (total, diagnostic) => total + diagnostic.characterCount,
      0,
    ),
  };
}

function parseFeedbackIssues(feedback: string) {
  const normalized = feedback
    .replace(/\r/g, "\n")
    .replace(/AI review summary:/gi, "\n")
    .replace(/Strengths?:/gi, "\n")
    .replace(/Concerns?:/gi, "\n")
    .replace(/Suggested next steps?:/gi, "\n")
    .replace(/Suggestions?:/gi, "\n");
  const lineCandidates = normalized
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);
  const candidates =
    lineCandidates.length >= 2
      ? lineCandidates
      : normalized
          .split(/(?<=[.!?])\s+/)
          .map((sentence) => sentence.trim());

  return Array.from(new Set(candidates))
    .filter((candidate) => candidate.length >= 24 && candidate.length <= 420)
    .filter((candidate) => !/^reviewed\s/i.test(candidate))
    .slice(0, maxIssueCount);
}

function evaluateIssueAgainstCurrentText(
  issue: string,
  currentText: string,
): DeltaReviewItem {
  const keywords = getKeywords(issue);
  const evidence = findEvidenceSnippets(currentText, keywords);
  const status =
    evidence.length > 0 ? "possibly_addressed" : "still_needs_review";

  return {
    issue,
    status,
    evidence,
    teacherAction:
      status === "possibly_addressed"
        ? "Verify that the cited evidence fully resolves the previous feedback, not only mentions the same topic."
        : "Check the latest document manually and give targeted feedback if the issue remains unresolved.",
  };
}

function findNewEvidence({
  currentText,
  previousText,
  studentNote,
}: {
  currentText: string;
  previousText: string;
  studentNote: string | null;
}) {
  const evidence: NewEvidenceItem[] = [];

  if (studentNote?.trim()) {
    evidence.push({
      label: "Student change note",
      evidence: truncateSnippet(studentNote.trim()),
      teacherAction:
        "Use this note as the student's stated intent, then verify it against the uploaded document.",
    });
  }

  const previousLower = normalizeForSearch(previousText);
  const currentParagraphs = splitParagraphs(currentText);

  for (const paragraph of currentParagraphs) {
    if (evidence.length >= maxEvidenceCount) {
      break;
    }

    const normalizedParagraph = normalizeForSearch(paragraph);

    if (
      normalizedParagraph.length < 80 ||
      previousLower.includes(normalizedParagraph.slice(0, 80))
    ) {
      continue;
    }

    evidence.push({
      label: "New or substantially changed evidence",
      evidence: truncateSnippet(paragraph),
      teacherAction:
        "Check whether this new evidence responds to earlier feedback or introduces a new issue to review.",
    });
  }

  return evidence;
}

function findEvidenceSnippets(text: string, keywords: string[]) {
  if (!text.trim() || keywords.length === 0) {
    return [];
  }

  return splitParagraphs(text)
    .map((paragraph) => {
      const lower = paragraph.toLowerCase();
      const score = keywords.reduce(
        (total, keyword) => total + (lower.includes(keyword) ? 1 : 0),
        0,
      );

      return { paragraph, score };
    })
    .filter((item) => item.score >= Math.min(2, keywords.length))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((item) => truncateSnippet(item.paragraph));
}

function splitParagraphs(text: string) {
  return text
    .split(/\n{2,}|(?<=\.)\s+(?=[A-Z])/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length >= 40);
}

function getKeywords(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .map((word) => word.trim())
        .filter((word) => word.length >= 4)
        .filter((word) => !stopWords.has(word)),
    ),
  ).slice(0, 10);
}

function normalizeForSearch(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function truncateSnippet(value: string) {
  const maxLength = 520;

  return value.length > maxLength
    ? `${value.slice(0, maxLength).trim()}...`
    : value;
}

function getConfidence({
  currentCharacterCount,
  previousCharacterCount,
  issueCount,
}: {
  currentCharacterCount: number;
  previousCharacterCount: number;
  issueCount: number;
}) {
  if (currentCharacterCount < 300 || issueCount < 2) {
    return "low";
  }

  if (currentCharacterCount >= 1500 && previousCharacterCount >= 500) {
    return "medium";
  }

  return "low";
}

function buildSummary({
  currentVersionNumber,
  previousVersionNumber,
  resolvedCount,
  remainingCount,
  newEvidenceCount,
  confidence,
}: {
  currentVersionNumber: number;
  previousVersionNumber: number;
  resolvedCount: number;
  remainingCount: number;
  newEvidenceCount: number;
  confidence: string;
}) {
  return `Compared v${previousVersionNumber} feedback with v${currentVersionNumber}. ${resolvedCount} previous issue(s) have possible response evidence, ${remainingCount} still need teacher review, and ${newEvidenceCount} new or changed evidence item(s) were detected. Confidence is ${confidence}; teacher verification is required.`;
}
