-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('CLIENT', 'CHECK');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "expectedOutput" TEXT,
ADD COLUMN     "kind" "JobKind" NOT NULL DEFAULT 'CLIENT',
ADD COLUMN     "targetMachineId" TEXT,
ALTER COLUMN "clientId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Machine" ADD COLUMN     "checksFailed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "checksPassed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspensionReason" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_targetMachineId_fkey" FOREIGN KEY ("targetMachineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
