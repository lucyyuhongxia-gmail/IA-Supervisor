-- CreateEnum
CREATE TYPE "DeliverableReviewMode" AS ENUM ('single_criterion', 'multi_criteria', 'final_package');

-- CreateTable
CREATE TABLE "subject_deliverable_templates" (
    "id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "file_requirement" TEXT,
    "review_mode" "DeliverableReviewMode" NOT NULL DEFAULT 'single_criterion',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subject_deliverable_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_deliverable_template_criteria" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "criterion_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "subject_deliverable_template_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_deliverables" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "source_template_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "file_requirement" TEXT,
    "review_mode" "DeliverableReviewMode" NOT NULL DEFAULT 'single_criterion',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_deliverable_criteria" (
    "id" TEXT NOT NULL,
    "deliverable_id" TEXT NOT NULL,
    "criterion_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "class_deliverable_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subject_deliverable_templates_subject_id_idx" ON "subject_deliverable_templates"("subject_id");

-- CreateIndex
CREATE INDEX "subject_deliverable_template_criteria_criterion_id_idx" ON "subject_deliverable_template_criteria"("criterion_id");

-- CreateIndex
CREATE UNIQUE INDEX "subject_deliverable_template_criteria_template_id_criterion_key" ON "subject_deliverable_template_criteria"("template_id", "criterion_id");

-- CreateIndex
CREATE INDEX "class_deliverables_class_id_idx" ON "class_deliverables"("class_id");

-- CreateIndex
CREATE INDEX "class_deliverables_source_template_id_idx" ON "class_deliverables"("source_template_id");

-- CreateIndex
CREATE INDEX "class_deliverable_criteria_criterion_id_idx" ON "class_deliverable_criteria"("criterion_id");

-- CreateIndex
CREATE UNIQUE INDEX "class_deliverable_criteria_deliverable_id_criterion_id_key" ON "class_deliverable_criteria"("deliverable_id", "criterion_id");

-- AddForeignKey
ALTER TABLE "subject_deliverable_templates" ADD CONSTRAINT "subject_deliverable_templates_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_deliverable_template_criteria" ADD CONSTRAINT "subject_deliverable_template_criteria_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "subject_deliverable_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_deliverable_template_criteria" ADD CONSTRAINT "subject_deliverable_template_criteria_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "criterion_defs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_deliverables" ADD CONSTRAINT "class_deliverables_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_deliverables" ADD CONSTRAINT "class_deliverables_source_template_id_fkey" FOREIGN KEY ("source_template_id") REFERENCES "subject_deliverable_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_deliverable_criteria" ADD CONSTRAINT "class_deliverable_criteria_deliverable_id_fkey" FOREIGN KEY ("deliverable_id") REFERENCES "class_deliverables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_deliverable_criteria" ADD CONSTRAINT "class_deliverable_criteria_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "criterion_defs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
