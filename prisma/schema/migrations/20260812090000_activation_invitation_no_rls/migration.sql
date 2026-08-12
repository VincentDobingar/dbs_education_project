-- Same class of issue as the TenantDomain and ParentStudentRelationship corrections
-- (see 20260806193000_tenant_domain_no_rls, 20260806201500_parent_student_relationship_no_rls):
-- redeemActivation (§8) resolves the tenant FROM the activation code itself, before
-- any tenant context exists — there is no "current tenant" yet to scope by at the
-- moment this lookup runs (the beneficiary is not a member of the child's tenant
-- until redemption succeeds).
--
-- This is safe without RLS because the query is always a findUnique on the exact
-- primary key taken from an already-verified ActivationCode row (itself gated by a
-- unique, hashed, single-use secret) — a precise point lookup, never a scan or
-- listing. The service still validates status/expiry/revocation before granting
-- anything, and every other access pattern (e.g. "list this tenant's invitations")
-- keeps going through the application-level tenant guard once a tenant context
-- exists.
DROP POLICY IF EXISTS tenant_isolation ON "ActivationInvitation";
ALTER TABLE "ActivationInvitation" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "ActivationInvitation" DISABLE ROW LEVEL SECURITY;
