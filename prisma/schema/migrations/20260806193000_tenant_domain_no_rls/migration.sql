-- Correction: TenantDomain cannot have RLS. Resolving a subdomain to a tenant
-- (enforceTenantScope's bootstrap lookup, before any tenant context exists) is
-- inherently a cross-tenant read — that is the whole point of the lookup. RLS
-- requiring app.tenant_id to already be set makes that lookup impossible.
--
-- This is not a security regression: a subdomain -> tenant id mapping is routing
-- metadata, not tenant business data, and the application-level tenant guard
-- (apps/api/src/lib/prisma.ts) still scopes TenantDomain normally for every other
-- access pattern (e.g. "list this tenant's domains") once a tenant context exists.
DROP POLICY IF EXISTS tenant_isolation ON "TenantDomain";
ALTER TABLE "TenantDomain" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "TenantDomain" DISABLE ROW LEVEL SECURITY;
