/*
  Warnings:

  - Added the required column `city` to the `user` table without a default value. This is not possible if the table is not empty.
  - Added the required column `neighborhood` to the `user` table without a default value. This is not possible if the table is not empty.
  - Added the required column `number` to the `user` table without a default value. This is not possible if the table is not empty.
  - Added the required column `privacyVersion` to the `user` table without a default value. This is not possible if the table is not empty.
  - Added the required column `state` to the `user` table without a default value. This is not possible if the table is not empty.
  - Added the required column `street` to the `user` table without a default value. This is not possible if the table is not empty.
  - Added the required column `termsVersion` to the `user` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "user" ADD COLUMN     "city" TEXT NOT NULL,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "neighborhood" TEXT NOT NULL,
ADD COLUMN     "number" TEXT NOT NULL,
ADD COLUMN     "privacyAcceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "privacyVersion" TEXT NOT NULL,
ADD COLUMN     "state" TEXT NOT NULL,
ADD COLUMN     "street" TEXT NOT NULL,
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "termsVersion" TEXT NOT NULL;
