/*
  Warnings:

  - The values [COMPLETED,CANCELLED_BY_ADMIN] on the enum `GiveUpRequestStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [HAS_OWNER,STRAY_ANIMAL,TEMPORARY_HOME] on the enum `PetAdoptionStatus` will be removed. If these variants are still used in the database, this will fail.
  - Added the required column `adopterCep` to the `AdoptionRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `adopterCity` to the `AdoptionRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `adopterNeighborhood` to the `AdoptionRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `adopterNumber` to the `AdoptionRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `adopterState` to the `AdoptionRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `adopterStreet` to the `AdoptionRequest` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PetHomeStatus" AS ENUM ('HAS_OWNER', 'TEMPORARY_HOME', 'STRAY_ANIMAL');

-- AlterEnum
BEGIN;
CREATE TYPE "GiveUpRequestStatus_new" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
ALTER TABLE "public"."GiveUpRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "GiveUpRequest" ALTER COLUMN "status" TYPE "GiveUpRequestStatus_new" USING ("status"::text::"GiveUpRequestStatus_new");
ALTER TYPE "GiveUpRequestStatus" RENAME TO "GiveUpRequestStatus_old";
ALTER TYPE "GiveUpRequestStatus_new" RENAME TO "GiveUpRequestStatus";
DROP TYPE "public"."GiveUpRequestStatus_old";
ALTER TABLE "GiveUpRequest" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "PetAdoptionStatus_new" AS ENUM ('FOR_ADOPTION', 'ADOPTED', 'NONE');
ALTER TABLE "public"."Pet" ALTER COLUMN "adoptionStatus" DROP DEFAULT;
ALTER TABLE "Pet" ALTER COLUMN "adoptionStatus" TYPE "PetAdoptionStatus_new" USING ("adoptionStatus"::text::"PetAdoptionStatus_new");
ALTER TYPE "PetAdoptionStatus" RENAME TO "PetAdoptionStatus_old";
ALTER TYPE "PetAdoptionStatus_new" RENAME TO "PetAdoptionStatus";
DROP TYPE "public"."PetAdoptionStatus_old";
ALTER TABLE "Pet" ALTER COLUMN "adoptionStatus" SET DEFAULT 'NONE';
COMMIT;

-- AlterTable
ALTER TABLE "AdoptionRequest" ADD COLUMN     "adoptedAt" TIMESTAMP(3),
ADD COLUMN     "adopterCep" TEXT NOT NULL,
ADD COLUMN     "adopterCity" TEXT NOT NULL,
ADD COLUMN     "adopterNeighborhood" TEXT NOT NULL,
ADD COLUMN     "adopterNumber" TEXT NOT NULL,
ADD COLUMN     "adopterState" TEXT NOT NULL,
ADD COLUMN     "adopterStreet" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "GiveUpRequest" ADD COLUMN     "approvedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Pet" ADD COLUMN     "homeStatus" "PetHomeStatus" NOT NULL DEFAULT 'HAS_OWNER',
ALTER COLUMN "adoptionStatus" SET DEFAULT 'NONE';
