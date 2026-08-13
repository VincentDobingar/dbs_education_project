-- AlterTable: add nullable first, backfill from Student.tenantId, then enforce NOT NULL —
-- safe whether or not StudentUserLink already has rows (§26).
ALTER TABLE "StudentUserLink" ADD COLUMN     "tenantId" TEXT;

UPDATE "StudentUserLink" sul
SET "tenantId" = s."tenantId"
FROM "Student" s
WHERE s.id = sul."studentId";

ALTER TABLE "StudentUserLink" ALTER COLUMN "tenantId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "StudentUserLink_tenantId_idx" ON "StudentUserLink"("tenantId");

-- Deliberately NO RLS enabled on this table (§2): requireLinkedStudent (§26) reads
-- it via rawPrisma to resolve the tenant BEFORE any tenant context exists — same
-- bootstrap case as TenantDomain/ParentStudentRelationship/ActivationInvitation.
-- The application-level tenant guard (StudentUserLink now in TENANT_SCOPED_MODELS)
-- still protects every other access pattern once a tenant context is established.
