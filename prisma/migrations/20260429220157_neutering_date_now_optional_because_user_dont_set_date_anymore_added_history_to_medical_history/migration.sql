/*
  Warnings:

  - Added the required column `history` to the `MedicalRecord` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "MedicalRecord" DROP CONSTRAINT "MedicalRecord_petId_fkey";

-- AlterTable
ALTER TABLE "MedicalRecord" ADD COLUMN     "history" VARCHAR(8000) NOT NULL,
ALTER COLUMN "petId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "NeuteringAppointment" ALTER COLUMN "scheduleDate" DROP NOT NULL,
ALTER COLUMN "period" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "MedicalRecord" ADD CONSTRAINT "MedicalRecord_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
