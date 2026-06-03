-- CreateEnum
CREATE TYPE "AIReviewRunStatus" AS ENUM ('pending', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "AIReviewFindingType" AS ENUM ('strength', 'concern', 'suggestion');

-- CreateTable
CREATE TABLE "ai_review_runs" (
    "id" TEXT NOT NULL,
    "submission_slot_id" TEXT NOT NULL,
    "submission_version_id" TEXT,
    "criterion_id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "status" "AIReviewRunStatus" NOT NULL DEFAULT 'pending',
    "provider" TEXT NOT NULL,
    "model_name" TEXT,
    "reference_key" TEXT NOT NULL DEFAULT 'ib-cs-ia-2027',
    "summary" TEXT,
    "confidence" TEXT,
    "error_message" TEXT,
    "raw_response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_review_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_review_findings" (
    "id" TEXT NOT NULL,
    "ai_review_run_id" TEXT NOT NULL,
    "type" "AIReviewFindingType" NOT NULL,
    "text" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_review_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_review_runs_submission_slot_id_idx" ON "ai_review_runs"("submission_slot_id");

-- CreateIndex
CREATE INDEX "ai_review_runs_submission_version_id_idx" ON "ai_review_runs"("submission_version_id");

-- CreateIndex
CREATE INDEX "ai_review_runs_criterion_id_idx" ON "ai_review_runs"("criterion_id");

-- CreateIndex
CREATE INDEX "ai_review_runs_requested_by_id_idx" ON "ai_review_runs"("requested_by_id");

-- CreateIndex
CREATE INDEX "ai_review_findings_ai_review_run_id_idx" ON "ai_review_findings"("ai_review_run_id");

-- AddForeignKey
ALTER TABLE "ai_review_runs" ADD CONSTRAINT "ai_review_runs_submission_slot_id_fkey" FOREIGN KEY ("submission_slot_id") REFERENCES "submission_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_review_runs" ADD CONSTRAINT "ai_review_runs_submission_version_id_fkey" FOREIGN KEY ("submission_version_id") REFERENCES "submission_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_review_runs" ADD CONSTRAINT "ai_review_runs_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "criterion_defs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_review_runs" ADD CONSTRAINT "ai_review_runs_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_review_findings" ADD CONSTRAINT "ai_review_findings_ai_review_run_id_fkey" FOREIGN KEY ("ai_review_run_id") REFERENCES "ai_review_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
