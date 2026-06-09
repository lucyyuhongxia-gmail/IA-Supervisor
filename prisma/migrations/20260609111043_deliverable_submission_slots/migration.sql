-- AlterTable
ALTER TABLE "file_assets" ADD COLUMN     "deliverable_submission_slot_id" TEXT,
ADD COLUMN     "deliverable_submission_version_id" TEXT;

-- CreateTable
CREATE TABLE "deliverable_submission_slots" (
    "id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "deliverable_id" TEXT NOT NULL,
    "latest_version_id" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'not_started',
    "notes" TEXT,
    "teacher_feedback" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "deliverable_submission_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverable_submission_versions" (
    "id" TEXT NOT NULL,
    "deliverable_submission_slot_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "notes" TEXT,
    "teacher_feedback" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliverable_submission_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deliverable_submission_slots_latest_version_id_key" ON "deliverable_submission_slots"("latest_version_id");

-- CreateIndex
CREATE INDEX "deliverable_submission_slots_deliverable_id_idx" ON "deliverable_submission_slots"("deliverable_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliverable_submission_slots_enrollment_id_deliverable_id_key" ON "deliverable_submission_slots"("enrollment_id", "deliverable_id");

-- CreateIndex
CREATE INDEX "deliverable_submission_versions_deliverable_submission_slot_idx" ON "deliverable_submission_versions"("deliverable_submission_slot_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliverable_submission_versions_deliverable_submission_slot_key" ON "deliverable_submission_versions"("deliverable_submission_slot_id", "version_number");

-- CreateIndex
CREATE INDEX "file_assets_deliverable_submission_slot_id_idx" ON "file_assets"("deliverable_submission_slot_id");

-- CreateIndex
CREATE INDEX "file_assets_deliverable_submission_version_id_idx" ON "file_assets"("deliverable_submission_version_id");

-- AddForeignKey
ALTER TABLE "deliverable_submission_slots" ADD CONSTRAINT "deliverable_submission_slots_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_submission_slots" ADD CONSTRAINT "deliverable_submission_slots_deliverable_id_fkey" FOREIGN KEY ("deliverable_id") REFERENCES "class_deliverables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_submission_slots" ADD CONSTRAINT "deliverable_submission_slots_latest_version_id_fkey" FOREIGN KEY ("latest_version_id") REFERENCES "deliverable_submission_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_submission_slots" ADD CONSTRAINT "deliverable_submission_slots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverable_submission_versions" ADD CONSTRAINT "deliverable_submission_versions_deliverable_submission_slo_fkey" FOREIGN KEY ("deliverable_submission_slot_id") REFERENCES "deliverable_submission_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_deliverable_submission_slot_id_fkey" FOREIGN KEY ("deliverable_submission_slot_id") REFERENCES "deliverable_submission_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_deliverable_submission_version_id_fkey" FOREIGN KEY ("deliverable_submission_version_id") REFERENCES "deliverable_submission_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
