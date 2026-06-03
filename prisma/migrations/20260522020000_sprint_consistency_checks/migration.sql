-- CreateEnum
CREATE TYPE "ConsistencyCheckStatus" AS ENUM ('met', 'partial', 'missing', 'insufficient_evidence');

-- CreateEnum
CREATE TYPE "ConsistencyCheckSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateTable
CREATE TABLE "consistency_checks" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "source_criterion_id" TEXT,
    "target_criterion_id" TEXT,
    "requested_by_id" TEXT NOT NULL,
    "check_type" TEXT NOT NULL,
    "status" "ConsistencyCheckStatus" NOT NULL,
    "severity" "ConsistencyCheckSeverity" NOT NULL,
    "summary" TEXT NOT NULL,
    "evidence_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consistency_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consistency_checks_class_id_idx" ON "consistency_checks"("class_id");

-- CreateIndex
CREATE INDEX "consistency_checks_enrollment_id_idx" ON "consistency_checks"("enrollment_id");

-- CreateIndex
CREATE INDEX "consistency_checks_run_id_idx" ON "consistency_checks"("run_id");

-- CreateIndex
CREATE INDEX "consistency_checks_requested_by_id_idx" ON "consistency_checks"("requested_by_id");

-- CreateIndex
CREATE INDEX "consistency_checks_source_criterion_id_idx" ON "consistency_checks"("source_criterion_id");

-- CreateIndex
CREATE INDEX "consistency_checks_target_criterion_id_idx" ON "consistency_checks"("target_criterion_id");

-- AddForeignKey
ALTER TABLE "consistency_checks" ADD CONSTRAINT "consistency_checks_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consistency_checks" ADD CONSTRAINT "consistency_checks_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consistency_checks" ADD CONSTRAINT "consistency_checks_source_criterion_id_fkey" FOREIGN KEY ("source_criterion_id") REFERENCES "criterion_defs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consistency_checks" ADD CONSTRAINT "consistency_checks_target_criterion_id_fkey" FOREIGN KEY ("target_criterion_id") REFERENCES "criterion_defs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consistency_checks" ADD CONSTRAINT "consistency_checks_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
