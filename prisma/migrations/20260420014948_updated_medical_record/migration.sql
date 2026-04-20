/*
  Warnings:

  - You are about to alter the column `description` on the `EmergencyAppointment` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(1000)`.
  - You are about to alter the column `reason` on the `GiveUpRequest` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(8000)`.
  - You are about to drop the column `adminId` on the `MedicalRecord` table. All the data in the column will be lost.
  - You are about to alter the column `notes` on the `MedicalRecord` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(8000)`.

*/
-- AlterTable
ALTER TABLE "EmergencyAppointment" ALTER COLUMN "description" SET DATA TYPE VARCHAR(1000);

-- AlterTable
ALTER TABLE "GiveUpRequest" ALTER COLUMN "reason" SET DATA TYPE VARCHAR(8000);

-- AlterTable
ALTER TABLE "MedicalRecord" DROP COLUMN "adminId",
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ALTER COLUMN "notes" SET DATA TYPE VARCHAR(8000);
