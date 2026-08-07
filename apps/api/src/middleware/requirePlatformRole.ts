import type { NextFunction, Request, Response } from "express";

import { userHasPlatformRole } from "../lib/authorization.js";

export function requirePlatformRole(...allowedCodes: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      if (!req.user) {
        res.status(401).json({ code: "UNAUTHENTICATED", message: "requireAuth must run first" });
        return;
      }

      if (!(await userHasPlatformRole(req.user.id, allowedCodes))) {
        res.status(403).json({ code: "PLATFORM_ROLE_REQUIRED", message: "Insufficient platform role" });
        return;
      }

      next();
    })().catch(next);
  };
}
