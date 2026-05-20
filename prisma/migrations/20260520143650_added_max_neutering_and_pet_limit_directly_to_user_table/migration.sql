-- AlterTable
ALTER TABLE "user" ADD COLUMN     "maxMonthlyNeuteringRequestLimit" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "maxPetLimit" INTEGER NOT NULL DEFAULT 8;
