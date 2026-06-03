-- CreateEnum
CREATE TYPE "SemanticExtractionStatus" AS ENUM ('generated', 'teacher_confirmed', 'student_confirmed', 'failed');

-- CreateTable
CREATE TABLE "semantic_extractions" (
    "id" TEXT NOT NULL,
    "submission_slot_id" TEXT NOT NULL,
    "submission_version_id" TEXT NOT NULL,
    "criterion_id" TEXT NOT NULL,
    "status" "SemanticExtractionStatus" NOT NULL DEFAULT 'generated',
    "confidence" TEXT,
    "extracted_json" JSONB NOT NULL,
    "source_character_count" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "semantic_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "semantic_extractions_submission_version_id_criterion_id_key" ON "semantic_extractions"("submission_version_id", "criterion_id");

-- CreateIndex
CREATE INDEX "semantic_extractions_submission_slot_id_idx" ON "semantic_extractions"("submission_slot_id");

-- CreateIndex
CREATE INDEX "semantic_extractions_criterion_id_idx" ON "semantic_extractions"("criterion_id");

-- CreateIndex
CREATE INDEX "semantic_extractions_confirmed_by_id_idx" ON "semantic_extractions"("confirmed_by_id");

-- AddForeignKey
ALTER TABLE "semantic_extractions" ADD CONSTRAINT "semantic_extractions_submission_slot_id_fkey" FOREIGN KEY ("submission_slot_id") REFERENCES "submission_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_extractions" ADD CONSTRAINT "semantic_extractions_submission_version_id_fkey" FOREIGN KEY ("submission_version_id") REFERENCES "submission_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_extractions" ADD CONSTRAINT "semantic_extractions_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "criterion_defs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_extractions" ADD CONSTRAINT "semantic_extractions_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
