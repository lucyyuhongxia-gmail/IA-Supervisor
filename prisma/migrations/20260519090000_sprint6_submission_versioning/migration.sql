-- AlterTable
ALTER TABLE "file_assets" ADD COLUMN     "submission_version_id" TEXT,
ALTER COLUMN "submission_slot_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "submission_slots" ADD COLUMN     "latest_version_id" TEXT;

-- CreateTable
CREATE TABLE "submission_versions" (
    "id" TEXT NOT NULL,
    "submission_slot_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "draft_title" TEXT,
    "notes" TEXT,
    "teacher_feedback" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submission_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "submission_versions_submission_slot_id_idx" ON "submission_versions"("submission_slot_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_versions_submission_slot_id_version_number_key" ON "submission_versions"("submission_slot_id", "version_number");

-- CreateIndex
CREATE INDEX "file_assets_submission_version_id_idx" ON "file_assets"("submission_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_slots_latest_version_id_key" ON "submission_slots"("latest_version_id");

-- AddForeignKey
ALTER TABLE "submission_slots" ADD CONSTRAINT "submission_slots_latest_version_id_fkey" FOREIGN KEY ("latest_version_id") REFERENCES "submission_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_versions" ADD CONSTRAINT "submission_versions_submission_slot_id_fkey" FOREIGN KEY ("submission_slot_id") REFERENCES "submission_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_submission_version_id_fkey" FOREIGN KEY ("submission_version_id") REFERENCES "submission_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
