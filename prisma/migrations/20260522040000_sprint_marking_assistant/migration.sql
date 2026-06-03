-- CreateTable
CREATE TABLE "marking_snapshots" (
    "id" TEXT NOT NULL,
    "submission_slot_id" TEXT NOT NULL,
    "submission_version_id" TEXT NOT NULL,
    "criterion_id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "source_ai_review_run_id" TEXT,
    "suggested_mark_min" INTEGER NOT NULL,
    "suggested_mark_max" INTEGER NOT NULL,
    "suggested_single_mark" INTEGER,
    "confidence" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "descriptor_evidence_json" JSONB NOT NULL,
    "teacher_final_mark" INTEGER,
    "teacher_final_comment" TEXT,
    "final_marked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marking_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marking_snapshots_submission_slot_id_idx" ON "marking_snapshots"("submission_slot_id");

-- CreateIndex
CREATE INDEX "marking_snapshots_submission_version_id_idx" ON "marking_snapshots"("submission_version_id");

-- CreateIndex
CREATE INDEX "marking_snapshots_criterion_id_idx" ON "marking_snapshots"("criterion_id");

-- CreateIndex
CREATE INDEX "marking_snapshots_requested_by_id_idx" ON "marking_snapshots"("requested_by_id");

-- CreateIndex
CREATE INDEX "marking_snapshots_source_ai_review_run_id_idx" ON "marking_snapshots"("source_ai_review_run_id");

-- AddForeignKey
ALTER TABLE "marking_snapshots" ADD CONSTRAINT "marking_snapshots_submission_slot_id_fkey" FOREIGN KEY ("submission_slot_id") REFERENCES "submission_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marking_snapshots" ADD CONSTRAINT "marking_snapshots_submission_version_id_fkey" FOREIGN KEY ("submission_version_id") REFERENCES "submission_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marking_snapshots" ADD CONSTRAINT "marking_snapshots_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "criterion_defs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marking_snapshots" ADD CONSTRAINT "marking_snapshots_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marking_snapshots" ADD CONSTRAINT "marking_snapshots_source_ai_review_run_id_fkey" FOREIGN KEY ("source_ai_review_run_id") REFERENCES "ai_review_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
