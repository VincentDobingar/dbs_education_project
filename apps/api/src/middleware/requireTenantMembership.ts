import type { NextFunction, Request, Response } from "express";

import { prisma } from "../lib/prisma.js";

export function requireTenantMembership(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user || !req.tenant) {
      res.status(401).json({ code: "UNAUTHENTICATED", message: "Auth and tenant resolution must run first" });
      return;
    }

    const membership = await prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: req.user.id, tenantId: req.tenant.id } },
    });

    if (!membership || membership.status !== "ACTIVE") {
      res.status(403).json({ code: "TENANT_MEMBERSHIP_REQUIRED", message: "Not a member of this tenant" });
      return;
    }

    next();
  })().catch(next);
}
