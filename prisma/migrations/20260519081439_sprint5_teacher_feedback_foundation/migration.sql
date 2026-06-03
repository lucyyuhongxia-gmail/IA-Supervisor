-- AlterTable
ALTER TABLE "submission_slots" ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "teacher_feedback" TEXT;
