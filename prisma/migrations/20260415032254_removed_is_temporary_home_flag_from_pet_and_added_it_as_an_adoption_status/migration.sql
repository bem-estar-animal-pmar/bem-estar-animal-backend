/*
  Warnings:

  - You are about to drop the column `isTemporaryHome` on the `Pet` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "PetAdoptionStatus" ADD VALUE 'TEMPORARY_HOME';

-- AlterTable
ALTER TABLE "Pet" DROP COLUMN "isTemporaryHome";
