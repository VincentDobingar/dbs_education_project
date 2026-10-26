ALTER TABLE "Guardian" ADD COLUMN "address" TEXT;
ALTER TABLE "SchoolGuardian" ADD COLUMN "centralGuardianId" TEXT;
ALTER TABLE "SchoolGuardian" ADD CONSTRAINT "SchoolGuardian_centralGuardianId_fkey" FOREIGN KEY ("centralGuardianId") REFERENCES "Guardian"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "SchoolGuardian_centralGuardianId_idx" ON "SchoolGuardian"("centralGuardianId");
ALTER TABLE "ActivationInvitation" ADD COLUMN "schoolGuardianId" TEXT;
ALTER TABLE "ActivationInvitation" ADD CONSTRAINT "ActivationInvitation_schoolGuardianId_tenantId_fkey" FOREIGN KEY ("schoolGuardianId", "tenantId") REFERENCES "SchoolGuardian"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Student_id_tenantId_key" ON "Student"("id", "tenantId");
CREATE TABLE "ParentSubscriptionCoverage" (
 "id" TEXT NOT NULL PRIMARY KEY, "parentUserId" TEXT NOT NULL, "studentId" TEXT NOT NULL,
 "tenantId" TEXT NOT NULL, "subscriptionId" TEXT NOT NULL, "releasedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ParentSubscriptionCoverage_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ParentSubscriptionCoverage_studentId_tenantId_fkey" FOREIGN KEY ("studentId", "tenantId") REFERENCES "Student"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ParentSubscriptionCoverage_subscriptionId_studentId_tenantId_key" ON "ParentSubscriptionCoverage"("subscriptionId", "studentId", "tenantId");
CREATE UNIQUE INDEX "ParentSubscriptionCoverage_current_child_school_key" ON "ParentSubscriptionCoverage"("studentId", "tenantId") WHERE "releasedAt" IS NULL;
CREATE INDEX "ParentSubscriptionCoverage_parentUserId_idx" ON "ParentSubscriptionCoverage"("parentUserId");
CREATE INDEX "ParentSubscriptionCoverage_tenantId_idx" ON "ParentSubscriptionCoverage"("tenantId");
CREATE TABLE "ParentContactChange" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "channel" TEXT NOT NULL, "value" TEXT NOT NULL,
 "codeHash" TEXT NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0, "expiresAt" TIMESTAMP(3) NOT NULL,
 "consumedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ParentContactChange_channel_check" CHECK ("channel" IN ('EMAIL', 'PHONE'))
);
CREATE INDEX "ParentContactChange_userId_idx" ON "ParentContactChange"("userId");
CREATE INDEX "ParentContactChange_expiresAt_idx" ON "ParentContactChange"("expiresAt");
-- Tables globales d'identité/autorisation, comme Guardian/ParentStudentRelationship.
-- Pas de RLS tenant : les services filtrent par l'utilisateur authentifié, puis
-- les données Student/SchoolGuardian sont lues sous leur RLS habituelle.
-- Aucun abonnement historique ne reçoit de couverture implicite.
