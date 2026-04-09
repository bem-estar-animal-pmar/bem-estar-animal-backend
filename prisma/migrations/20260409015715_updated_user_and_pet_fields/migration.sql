/*
  Warnings:

  - Changed the type of `species` on the `Pet` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `gender` on the `Pet` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "PetSpecies" AS ENUM ('DOG', 'CAT');

-- CreateEnum
CREATE TYPE "PetGender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "PetAdoptionStatus" AS ENUM ('FOR_ADOPTION', 'ADOPTED', 'HAS_OWNER', 'STRAY_ANIMAL');

-- DropForeignKey
ALTER TABLE "Pet" DROP CONSTRAINT "Pet_ownerId_fkey";

-- AlterTable
ALTER TABLE "Pet" ADD COLUMN     "adoptionStatus" "PetAdoptionStatus" NOT NULL DEFAULT 'HAS_OWNER',
ADD COLUMN     "chip" TEXT NOT NULL DEFAULT 'NO_CHIP',
ADD COLUMN     "isTemporaryHome" BOOLEAN NOT NULL DEFAULT false,
DROP COLUMN "species",
ADD COLUMN     "species" "PetSpecies" NOT NULL,
DROP COLUMN "gender",
ADD COLUMN     "gender" "PetGender" NOT NULL,
ALTER COLUMN "breed" SET DEFAULT 'NO_DEFINED_BREED';

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "blockedUntil" TIMESTAMP(3);

-- DropEnum
DROP TYPE "Gender";

-- DropEnum
DROP TYPE "Species";

-- AddForeignKey
ALTER TABLE "Pet" ADD CONSTRAINT "Pet_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
