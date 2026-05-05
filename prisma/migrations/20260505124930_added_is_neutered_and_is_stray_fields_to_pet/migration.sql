-- AlterTable
ALTER TABLE "Pet" ADD COLUMN     "allowEmergency" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isNeutered" BOOLEAN NOT NULL DEFAULT false;
