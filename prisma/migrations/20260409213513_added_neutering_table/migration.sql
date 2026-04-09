-- CreateEnum
CREATE TYPE "AnimalSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE');

-- CreateEnum
CREATE TYPE "NeuteringStatus" AS ENUM ('PENDING', 'AWAITING_EXAMS', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateTable
CREATE TABLE "NeuteringAppointment" (
    "id" TEXT NOT NULL,
    "status" "NeuteringStatus" NOT NULL DEFAULT 'PENDING',
    "scheduleDate" TIMESTAMP(3) NOT NULL,
    "period" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NeuteringAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalRecord" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "neuteringAppointmentId" TEXT,
    "emergencyAppointmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MedicalRecord_neuteringAppointmentId_key" ON "MedicalRecord"("neuteringAppointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "MedicalRecord_emergencyAppointmentId_key" ON "MedicalRecord"("emergencyAppointmentId");

-- AddForeignKey
ALTER TABLE "NeuteringAppointment" ADD CONSTRAINT "NeuteringAppointment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeuteringAppointment" ADD CONSTRAINT "NeuteringAppointment_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalRecord" ADD CONSTRAINT "MedicalRecord_petId_fkey" FOREIGN KEY ("petId") REFERENCES "Pet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalRecord" ADD CONSTRAINT "MedicalRecord_neuteringAppointmentId_fkey" FOREIGN KEY ("neuteringAppointmentId") REFERENCES "NeuteringAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
