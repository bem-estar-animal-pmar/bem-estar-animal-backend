/*
  Warnings:

  - Changed the type of `size` on the `EmergencyAppointment` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `size` to the `Pet` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PetSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- AlterTable
ALTER TABLE "EmergencyAppointment" DROP COLUMN "size",
ADD COLUMN     "size" "PetSize" NOT NULL;

-- AlterTable
ALTER TABLE "Pet" ADD COLUMN     "size" "PetSize" NOT NULL;

-- DropEnum
DROP TYPE "AnimalSize";
