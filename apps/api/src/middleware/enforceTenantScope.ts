import type { NextFunction, Request, Response } from "express";

import { rawPrisma } from "../lib/prisma.js";
import { runWithContext } from "../lib/tenant-context.js";
import { isTenantBlocked } from "../lib/tenant-status.js";

/**
 * Resolves the tenant for this request from its subdomain (or the X-Tenant-Slug
 * header, which exists purely because real wildcard-subdomain DNS is not wired up
 * for local dev yet — remove once it is). Never trust a tenant id sent as a body
 * or query parameter (§2): only the host the browser actually connected to, or this
 * explicit dev header, decide which tenant a request targets.
 */
function resolveSubdomain(req: Request): string | null {
  const override = req.headers["x-tenant-slug"];
  if (typeof override === "string" && override.length > 0) {
    return override;
  }

  const hostParts = req.hostname.split(".");
  // lycee-excellence.edumanage.africa -> "lycee-excellence" ; localhost -> none.
  return hostParts.length >= 3 ? (hostParts[0] ?? null) : null;
}

export function enforceTenantScope(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const subdomain = resolveSubdomain(req);

    if (!subdomain) {
      res.status(400).json({ code: "TENANT_NOT_RESOLVED", message: "No tenant subdomain in this request" });
      return;
    }

    const domain = await rawPrisma.tenantDomain.findUnique({
      where: { subdomain },
      include: { tenant: true },
    });

    if (!domain || !domain.verifiedAt || domain.tenant.deletedAt) {
      res.status(404).json({ code: "TENANT_NOT_FOUND", message: "Unknown or unverified tenant subdomain" });
      return;
    }

    if (isTenantBlocked(domain.tenant.status)) {
      res.status(403).json({ code: "TENANT_UNAVAILABLE", message: "This tenant is no longer available" });
      return;
    }

    req.tenant = { id: domain.tenant.id, name: domain.tenant.name, status: domain.tenant.status };

    runWithContext({ tenantId: domain.tenant.id, userId: req.user?.id ?? null }, () => {
      next();
    });
  })().catch(next);
}
