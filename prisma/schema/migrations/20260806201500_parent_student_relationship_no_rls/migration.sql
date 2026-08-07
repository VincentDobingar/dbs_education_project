-- Same class of issue as the TenantDomain correction (see
-- 20260806193000_tenant_domain_no_rls): requireVerifiedStudentRelationship
-- resolves a child's tenant FROM the (parentUserId, studentId) relationship
-- itself, before any tenant context exists (§9 — a parent's verified children
-- can live in different tenants, so there is no "current tenant" yet to scope by
-- at the moment this lookup runs).
--
-- This is safe without RLS because the query is always a findUnique on the exact
-- (parentUserId, studentId) compound key the caller already possesses — it is a
-- precise point lookup, never a scan or listing, and the middleware still enforces
-- status = VERIFIED and no revocation before granting anything. Any future table
-- that plays this same "resolve tenant context from a global identifier" role
-- should get the same treatment, with the same justification recorded here.
DROP POLICY IF EXISTS tenant_isolation ON "ParentStudentRelationship";
ALTER TABLE "ParentStudentRelationship" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ParentStudentRelationship" DISABLE ROW LEVEL SECURITY;
