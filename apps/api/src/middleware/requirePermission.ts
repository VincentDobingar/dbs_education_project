import type { NextFunction, Request, Response } from "express";

import { userHasPermission } from "../lib/authorization.js";

/** tenantId is read from req.tenant (set by enforceTenantScope); null = platform-scope permission. */
export function requirePermission(permissionCode: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      if (!req.user) {
        res.status(401).json({ code: "UNAUTHENTICATED", message: "requireAuth must run first" });
        return;
      }

      const tenantId = req.tenant?.id ?? null;

      if (!(await userHasPermission(req.user.id, tenantId, permissionCode))) {
        res.status(403).json({ code: "PERMISSION_DENIED", message: `Missing permission: ${permissionCode}` });
        return;
      }

      next();
    })().catch(next);
  };
}
