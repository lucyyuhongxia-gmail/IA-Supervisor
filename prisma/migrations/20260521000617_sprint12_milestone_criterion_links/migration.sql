-- AlterTable
ALTER TABLE "milestones" ADD COLUMN     "criterion_id" TEXT;

-- CreateIndex
CREATE INDEX "milestones_criterion_id_idx" ON "milestones"("criterion_id");

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "criterion_defs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
