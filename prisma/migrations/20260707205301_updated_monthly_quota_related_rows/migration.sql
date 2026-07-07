/*
  Warnings:

  - You are about to drop the `NeuteringConfig` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "NeuteringConfig";

-- CreateTable
CREATE TABLE "NeuteringMonthQuota" (
    "id" SERIAL NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "weekdayMorningLimit" INTEGER NOT NULL DEFAULT 12,
    "weekdayAfternoonLimit" INTEGER NOT NULL DEFAULT 6,
    "fridayMorningLimit" INTEGER NOT NULL DEFAULT 20,
    "fridayAfternoonLimit" INTEGER NOT NULL DEFAULT 7,

    CONSTRAINT "NeuteringMonthQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NeuteringDayException" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "morningLimit" INTEGER NOT NULL DEFAULT 0,
    "afternoonLimit" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NeuteringDayException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NeuteringMonthQuota_month_year_key" ON "NeuteringMonthQuota"("month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "NeuteringDayException_date_key" ON "NeuteringDayException"("date");
