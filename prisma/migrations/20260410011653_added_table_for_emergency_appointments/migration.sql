-- CreateEnum
CREATE TYPE "EmergencyStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateTable
CREATE TABLE "EmergencyAppointment" (
    "id" TEXT NOT NULL,
    "status" "EmergencyStatus" NOT NULL DEFAULT 'PENDING',
    "species" "PetSpecies" NOT NULL,
    "size" "AnimalSize" NOT NULL,
    "description" TEXT,
    "scheduleDate" TIMESTAMP(3),
    "period" TEXT,
    "userId" TEXT NOT NULL,
    "resultPetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmergencyAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyAppointment_resultPetId_key" ON "EmergencyAppointment"("resultPetId");

-- AddForeignKey
ALTER TABLE "EmergencyAppointment" ADD CONSTRAINT "EmergencyAppointment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmergencyAppointment" ADD CONSTRAINT "EmergencyAppointment_resultPetId_fkey" FOREIGN KEY ("resultPetId") REFERENCES "Pet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalRecord" ADD CONSTRAINT "MedicalRecord_emergencyAppointmentId_fkey" FOREIGN KEY ("emergencyAppointmentId") REFERENCES "EmergencyAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
