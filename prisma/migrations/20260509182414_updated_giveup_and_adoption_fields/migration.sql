/*
  Warnings:

  - The `status` column on the `AdoptionRequest` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `GiveUpRequest` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "GiveUpRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED_BY_ADMIN');

-- CreateEnum
CREATE TYPE "AdoptionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED_BY_ADMIN', 'RETURNED');

-- AlterTable
ALTER TABLE "AdoptionRequest" DROP COLUMN "status",
ADD COLUMN     "status" "AdoptionRequestStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "GiveUpRequest" DROP COLUMN "status",
ADD COLUMN     "status" "GiveUpRequestStatus" NOT NULL DEFAULT 'PENDING';

-- DropEnum
DROP TYPE "RequestStatus";
