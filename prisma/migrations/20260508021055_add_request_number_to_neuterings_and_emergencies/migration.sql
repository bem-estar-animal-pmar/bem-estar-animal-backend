/*
  Warnings:

  - A unique constraint covering the columns `[requestNumber]` on the table `EmergencyAppointment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[requestNumber]` on the table `NeuteringAppointment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "EmergencyAppointment" ADD COLUMN     "requestNumber" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "NeuteringAppointment" ADD COLUMN     "requestNumber" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyAppointment_requestNumber_key" ON "EmergencyAppointment"("requestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "NeuteringAppointment_requestNumber_key" ON "NeuteringAppointment"("requestNumber");
