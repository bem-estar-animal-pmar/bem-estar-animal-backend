/*
  Warnings:

  - Added the required column `name` to the `EmergencyAppointment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "EmergencyAppointment" ADD COLUMN     "gender" "PetGender",
ADD COLUMN     "name" TEXT NOT NULL;
