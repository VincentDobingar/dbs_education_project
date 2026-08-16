-- AlterTable: colonnes de verification email/telephone (§34) — toutes nullables,
-- aucun backfill necessaire (comptes existants restent verifies/non verifies tels quels).
ALTER TABLE "User" ADD COLUMN     "emailVerificationTokenHash" TEXT,
ADD COLUMN     "emailVerificationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "phoneVerificationCodeHash" TEXT,
ADD COLUMN     "phoneVerificationExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_emailVerificationTokenHash_key" ON "User"("emailVerificationTokenHash");
