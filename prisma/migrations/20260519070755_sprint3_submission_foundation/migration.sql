-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('not_started', 'draft', 'submitted', 'under_review', 'revision_needed', 'passed', 'final_submitted', 'locked');

-- CreateTable
CREATE TABLE "submission_slots" (
    "id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "criterion_id" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'not_started',
    "draft_title" TEXT,
    "artifact_url" TEXT,
    "notes" TEXT,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submission_slots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "submission_slots_criterion_id_idx" ON "submission_slots"("criterion_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_slots_enrollment_id_criterion_id_key" ON "submission_slots"("enrollment_id", "criterion_id");

-- AddForeignKey
ALTER TABLE "submission_slots" ADD CONSTRAINT "submission_slots_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_slots" ADD CONSTRAINT "submission_slots_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "criterion_defs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
