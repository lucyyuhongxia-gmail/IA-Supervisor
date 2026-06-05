-- AlterTable
ALTER TABLE "subjects" ADD COLUMN     "is_archived" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "subject_milestone_templates" (
    "id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "criterion_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "default_offset_days" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subject_milestone_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subject_milestone_templates_subject_id_idx" ON "subject_milestone_templates"("subject_id");

-- CreateIndex
CREATE INDEX "subject_milestone_templates_criterion_id_idx" ON "subject_milestone_templates"("criterion_id");

-- AddForeignKey
ALTER TABLE "subject_milestone_templates" ADD CONSTRAINT "subject_milestone_templates_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_milestone_templates" ADD CONSTRAINT "subject_milestone_templates_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "criterion_defs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
