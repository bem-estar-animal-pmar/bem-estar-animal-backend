-- CreateTable
CREATE TABLE "NeuteringConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "weekdayMorningLimit" INTEGER NOT NULL DEFAULT 12,
    "weekdayAfternoonLimit" INTEGER NOT NULL DEFAULT 6,
    "fridayMorningLimit" INTEGER NOT NULL DEFAULT 20,
    "fridayAfternoonLimit" INTEGER NOT NULL DEFAULT 7,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NeuteringConfig_pkey" PRIMARY KEY ("id")
);
