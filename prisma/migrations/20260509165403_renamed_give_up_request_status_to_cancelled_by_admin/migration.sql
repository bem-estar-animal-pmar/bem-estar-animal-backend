/*
  Warnings:

  - The values [CANCELLED_BY_USER] on the enum `RequestStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "RequestStatus_new" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED_BY_ADMIN');
ALTER TABLE "public"."AdoptionRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."GiveUpRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "GiveUpRequest" ALTER COLUMN "status" TYPE "RequestStatus_new" USING ("status"::text::"RequestStatus_new");
ALTER TABLE "AdoptionRequest" ALTER COLUMN "status" TYPE "RequestStatus_new" USING ("status"::text::"RequestStatus_new");
ALTER TYPE "RequestStatus" RENAME TO "RequestStatus_old";
ALTER TYPE "RequestStatus_new" RENAME TO "RequestStatus";
DROP TYPE "public"."RequestStatus_old";
ALTER TABLE "AdoptionRequest" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "GiveUpRequest" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;
