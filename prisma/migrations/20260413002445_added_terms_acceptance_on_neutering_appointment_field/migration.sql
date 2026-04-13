-- AlterTable
ALTER TABLE "NeuteringAppointment" ADD COLUMN     "animalChipAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "animalFastAccepted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "termsAccepted" BOOLEAN NOT NULL DEFAULT false;
