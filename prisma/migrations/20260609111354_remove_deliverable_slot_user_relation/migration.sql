/*
  Warnings:

  - You are about to drop the column `userId` on the `deliverable_submission_slots` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "deliverable_submission_slots" DROP CONSTRAINT "deliverable_submission_slots_userId_fkey";

-- AlterTable
ALTER TABLE "deliverable_submission_slots" DROP COLUMN "userId";
