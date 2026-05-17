/*
  Warnings:

  - A unique constraint covering the columns `[cpf]` on the table `user` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "user" ADD COLUMN     "history" VARCHAR(4000) NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "user_cpf_key" ON "user"("cpf");
