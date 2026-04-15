/*
  Warnings:

  - You are about to drop the column `resultPetId` on the `EmergencyAppointment` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "EmergencyAppointment" DROP CONSTRAINT "EmergencyAppointment_resultPetId_fkey";

-- DropIndex
DROP INDEX "EmergencyAppointment_resultPetId_key";

-- AlterTable
ALTER TABLE "EmergencyAppointment" DROP COLUMN "resultPetId",
ADD COLUMN     "animalChipAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "petId" TEXT,
ADD COLUMN     "temporaryHomeAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "termsAccepted" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "EmergencyAppointment" ADD CONSTRAINT "EmergencyAppointment_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE SET NULL ON UPDATE CASCADE;
