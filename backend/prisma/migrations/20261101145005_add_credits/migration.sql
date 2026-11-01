-- CreateEnum
CREATE TYPE "CreditMovementType" AS ENUM ('WELCOME', 'GRANT', 'RESERVE', 'REFUND', 'EARNING');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "costCredits" INTEGER,
ADD COLUMN     "reservedCredits" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "balance" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CreditMovement" (
    "id" TEXT NOT NULL,
    "type" "CreditMovementType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "jobId" TEXT,

    CONSTRAINT "CreditMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditMovement_userId_createdAt_idx" ON "CreditMovement"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CreditMovement" ADD CONSTRAINT "CreditMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditMovement" ADD CONSTRAINT "CreditMovement_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
