import "dotenv/config";

import { PrismaClient } from "@prisma/client";
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const prisma = new PrismaClient();

const officialClassName = "IB CS IA 2027 Official Examples";
const nextEnvPath = "next-env.d.ts";

async function main() {
  console.log("IA Supervisor local QA");
  console.log("This reseeds the official example fixture and does not run a real AI provider.\n");

  await run("Lint", "npm", ["run", "lint"]);
  await runBuildWithNextEnvRestore();
  await run("Mock AI provider preflight", "npm", ["run", "ai-review:check-provider"], {
    AI_REVIEW_PROVIDER: "mock",
    DEEPSEEK_API_KEY: "",
  });
  await run("Seed official IA examples", "npm", ["run", "demo:official-examples"]);
  await verifyOfficialFixture();
  await run("Official AI review dry-run smoke test", "npm", [
    "run",
    "ai-review:run-official",
    "--",
    "--dry-run",
    "--student",
    "official-example-1@student.test",
    "--criterion",
    "A",
    "--limit",
    "1",
  ]);
  await run("Official AI review benchmark smoke test", "npm", [
    "run",
    "ai-review:benchmark-official",
    "--",
    "--allow-missing",
  ]);

  console.log("\nLocal QA passed.");
}

async function runBuildWithNextEnvRestore() {
  const originalNextEnv = await readFile(nextEnvPath, "utf8").catch(() => null);

  try {
    await run("Build", "npm", ["run", "build"]);
  } finally {
    if (originalNextEnv !== null) {
      const currentNextEnv = await readFile(nextEnvPath, "utf8").catch(() => null);
      if (currentNextEnv !== null && currentNextEnv !== originalNextEnv) {
        await writeFile(nextEnvPath, originalNextEnv);
        console.log(`Restored ${nextEnvPath} after build.`);
      }
    }
  }
}

async function run(label, command, args, envOverrides = {}) {
  console.log(`\n== ${label} ==`);

  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...envOverrides },
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${label} failed with exit code ${code}.`));
    });
  });
}

async function verifyOfficialFixture() {
  console.log("\n== Verify official IA example fixture ==");

  const classRecord = await prisma.class.findFirst({
    where: { name: officialClassName },
    include: {
      deliverables: {
        where: { isArchived: false },
        select: { id: true },
      },
      enrollments: {
        select: { id: true },
      },
    },
  });

  if (!classRecord) {
    throw new Error(
      `Official class not found: ${officialClassName}. The seed command should have created it.`,
    );
  }

  const enrollmentIds = classRecord.enrollments.map((enrollment) => enrollment.id);

  const [
    criteriaCount,
    criterionSlotCount,
    submittedCriterionSlotCount,
    deliverableSlotCount,
    submittedDeliverableSlotCount,
    criterionFileAssetCount,
    deliverableFileAssetCount,
    totalFileAssetCount,
    pdfFileAssetCount,
    videoFileAssetCount,
    officialAIReviewRunCount,
  ] = await Promise.all([
    prisma.criterionDef.count({
      where: { subjectId: classRecord.subjectId },
    }),
    prisma.submissionSlot.count({
      where: { enrollmentId: { in: enrollmentIds } },
    }),
    prisma.submissionSlot.count({
      where: {
        enrollmentId: { in: enrollmentIds },
        status: "submitted",
        latestVersionId: { not: null },
      },
    }),
    prisma.deliverableSubmissionSlot.count({
      where: { enrollmentId: { in: enrollmentIds } },
    }),
    prisma.deliverableSubmissionSlot.count({
      where: {
        enrollmentId: { in: enrollmentIds },
        status: "submitted",
        latestVersionId: { not: null },
      },
    }),
    prisma.fileAsset.count({
      where: {
        submissionSlot: {
          enrollmentId: { in: enrollmentIds },
        },
      },
    }),
    prisma.fileAsset.count({
      where: {
        deliverableSubmissionSlot: {
          enrollmentId: { in: enrollmentIds },
        },
      },
    }),
    prisma.fileAsset.count({
      where: {
        owner: {
          enrollments: {
            some: {
              classId: classRecord.id,
            },
          },
        },
      },
    }),
    prisma.fileAsset.count({
      where: {
        mimeType: "application/pdf",
        owner: {
          enrollments: {
            some: {
              classId: classRecord.id,
            },
          },
        },
      },
    }),
    prisma.fileAsset.count({
      where: {
        mimeType: "video/mp4",
        owner: {
          enrollments: {
            some: {
              classId: classRecord.id,
            },
          },
        },
      },
    }),
    prisma.aIReviewRun.count({
      where: {
        submissionSlot: {
          enrollmentId: { in: enrollmentIds },
        },
      },
    }),
  ]);

  assertEqual("students", enrollmentIds.length, 8);
  assertEqual("criteria", criteriaCount, 5);
  assertEqual("class deliverables", classRecord.deliverables.length, 7);
  assertEqual("criterion slots", criterionSlotCount, 40);
  assertEqual("submitted criterion slots", submittedCriterionSlotCount, 40);
  assertEqual("deliverable slots", deliverableSlotCount, 56);
  assertEqual("submitted deliverable slots", submittedDeliverableSlotCount, 56);
  assertEqual("direct criterion file assets", criterionFileAssetCount, 48);
  assertEqual("direct deliverable file assets", deliverableFileAssetCount, 72);
  assertEqual("total official file assets", totalFileAssetCount, 120);
  assertEqual("official PDF file assets", pdfFileAssetCount, 112);
  assertEqual("official video file assets", videoFileAssetCount, 8);
  assertEqual("official AI review runs", officialAIReviewRunCount, 0);

  console.log("Official fixture verified.");
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}.`);
  }

  console.log(`${label}: ${actual}`);
}

main()
  .catch((error) => {
    console.error(`\nLocal QA failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
