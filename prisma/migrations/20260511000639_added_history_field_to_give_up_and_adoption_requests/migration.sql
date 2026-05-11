/*
  Warnings:

  - Added the required column `history` to the `AdoptionRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `history` to the `GiveUpRequest` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AdoptionRequest" ADD COLUMN     "history" VARCHAR(2000) NOT NULL;

-- AlterTable
ALTER TABLE "GiveUpRequest" ADD COLUMN     "history" VARCHAR(2000) NOT NULL;
