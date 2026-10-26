-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "verificationCodeHash" TEXT;
ALTER TABLE "User" ADD COLUMN "verificationExpiresAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "verificationSentAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "verificationAttempts" INTEGER NOT NULL DEFAULT 0;

-- Bestaande accounts behouden toegang na het invoeren van e-mailverificatie.
UPDATE "User" SET "emailVerified" = true;
