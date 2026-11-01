-- Unified accounts: every account can submit jobs and offer machines.
-- The CLIENT / PROVIDER / ADMIN role becomes a single "is administrator" flag.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Keep existing administrators (written by hand: Prisma would drop the role without this)
UPDATE "User" SET "isAdmin" = true WHERE "role" = 'ADMIN';

-- Accounts created before everyone got welcome credits receive them now
UPDATE "User" u SET "balance" = "balance" + 5000
WHERE NOT EXISTS (
  SELECT 1 FROM "CreditMovement" m WHERE m."userId" = u."id" AND m."type" = 'WELCOME'
);
INSERT INTO "CreditMovement" ("id", "type", "amount", "userId")
SELECT gen_random_uuid()::text, 'WELCOME', 5000, u."id" FROM "User" u
WHERE NOT EXISTS (
  SELECT 1 FROM "CreditMovement" m WHERE m."userId" = u."id" AND m."type" = 'WELCOME'
);

-- AlterTable
ALTER TABLE "User" DROP COLUMN "role";

-- DropEnum
DROP TYPE "Role";
