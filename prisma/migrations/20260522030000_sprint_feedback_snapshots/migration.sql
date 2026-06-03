-- CreateEnum
CREATE TYPE "FeedbackSnapshotStatus" AS ENUM ('draft', 'approved', 'sent', 'superseded');

-- CreateTable
CREATE TABLE "feedback_snapshots" (
    "id" TEXT NOT NULL,
    "submission_slot_id" TEXT NOT NULL,
    "submission_version_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "source_ai_review_run_id" TEXT,
    "status" "FeedbackSnapshotStatus" NOT NULL DEFAULT 'draft',
    "content" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_snapshots_submission_slot_id_idx" ON "feedback_snapshots"("submission_slot_id");

-- CreateIndex
CREATE INDEX "feedback_snapshots_submission_version_id_idx" ON "feedback_snapshots"("submission_version_id");

-- CreateIndex
CREATE INDEX "feedback_snapshots_created_by_id_idx" ON "feedback_snapshots"("created_by_id");

-- CreateIndex
CREATE INDEX "feedback_snapshots_source_ai_review_run_id_idx" ON "feedback_snapshots"("source_ai_review_run_id");

-- CreateIndex
CREATE INDEX "feedback_snapshots_status_idx" ON "feedback_snapshots"("status");

-- AddForeignKey
ALTER TABLE "feedback_snapshots" ADD CONSTRAINT "feedback_snapshots_submission_slot_id_fkey" FOREIGN KEY ("submission_slot_id") REFERENCES "submission_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_snapshots" ADD CONSTRAINT "feedback_snapshots_submission_version_id_fkey" FOREIGN KEY ("submission_version_id") REFERENCES "submission_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_snapshots" ADD CONSTRAINT "feedback_snapshots_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_snapshots" ADD CONSTRAINT "feedback_snapshots_source_ai_review_run_id_fkey" FOREIGN KEY ("source_ai_review_run_id") REFERENCES "ai_review_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
