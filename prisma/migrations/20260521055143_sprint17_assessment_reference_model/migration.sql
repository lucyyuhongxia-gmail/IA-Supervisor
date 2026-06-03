-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "active_assessment_reference_id" TEXT;

-- CreateTable
CREATE TABLE "assessment_references" (
    "id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_reference_files" (
    "id" TEXT NOT NULL,
    "assessment_reference_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_reference_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assessment_references_key_key" ON "assessment_references"("key");

-- CreateIndex
CREATE INDEX "assessment_references_subject_id_idx" ON "assessment_references"("subject_id");

-- CreateIndex
CREATE INDEX "assessment_reference_files_assessment_reference_id_idx" ON "assessment_reference_files"("assessment_reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_reference_files_assessment_reference_id_file_nam_key" ON "assessment_reference_files"("assessment_reference_id", "file_name");

-- CreateIndex
CREATE INDEX "subjects_active_assessment_reference_id_idx" ON "subjects"("active_assessment_reference_id");

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_active_assessment_reference_id_fkey" FOREIGN KEY ("active_assessment_reference_id") REFERENCES "assessment_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_references" ADD CONSTRAINT "assessment_references_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_reference_files" ADD CONSTRAINT "assessment_reference_files_assessment_reference_id_fkey" FOREIGN KEY ("assessment_reference_id") REFERENCES "assessment_references"("id") ON DELETE CASCADE ON UPDATE CASCADE;
