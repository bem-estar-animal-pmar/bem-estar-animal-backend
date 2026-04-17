-- AlterTable
ALTER TABLE "GiveUpRequest" ADD COLUMN     "temporaryHomeAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "termsAccepted" BOOLEAN NOT NULL DEFAULT false;
