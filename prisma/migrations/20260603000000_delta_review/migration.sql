CREATE TABLE "delta_reviews" (
    "id" TEXT NOT NULL,
    "submission_slot_id" TEXT NOT NULL,
    "previous_version_id" TEXT NOT NULL,
    "current_version_id" TEXT NOT NULL,
    "criterion_id" TEXT NOT NULL,
    "requested_by_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "resolved_json" JSONB NOT NULL,
    "remaining_json" JSONB NOT NULL,
    "new_evidence_json" JSONB NOT NULL,
    "source_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delta_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "delta_reviews_submission_slot_id_idx" ON "delta_reviews"("submission_slot_id");
CREATE INDEX "delta_reviews_previous_version_id_idx" ON "delta_reviews"("previous_version_id");
CREATE INDEX "delta_reviews_current_version_id_idx" ON "delta_reviews"("current_version_id");
CREATE INDEX "delta_reviews_criterion_id_idx" ON "delta_reviews"("criterion_id");
CREATE INDEX "delta_reviews_requested_by_id_idx" ON "delta_reviews"("requested_by_id");

ALTER TABLE "delta_reviews" ADD CONSTRAINT "delta_reviews_submission_slot_id_fkey" FOREIGN KEY ("submission_slot_id") REFERENCES "submission_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delta_reviews" ADD CONSTRAINT "delta_reviews_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "submission_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delta_reviews" ADD CONSTRAINT "delta_reviews_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "submission_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delta_reviews" ADD CONSTRAINT "delta_reviews_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "criterion_defs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "delta_reviews" ADD CONSTRAINT "delta_reviews_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
