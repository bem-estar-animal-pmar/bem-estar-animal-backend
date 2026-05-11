/*
  Warnings:

  - A unique constraint covering the columns `[requestNumber]` on the table `AdoptionRequest` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[requestNumber]` on the table `GiveUpRequest` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "AdoptionRequest" ADD COLUMN     "requestNumber" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "GiveUpRequest" ADD COLUMN     "requestNumber" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "AdoptionRequest_requestNumber_key" ON "AdoptionRequest"("requestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "GiveUpRequest_requestNumber_key" ON "GiveUpRequest"("requestNumber");
