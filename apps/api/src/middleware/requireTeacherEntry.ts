import type { Request, Response, NextFunction } from "express";

import { getTenantRoleCodes } from "../lib/authorization.js";
import { requireCurrentTenantId } from "../lib/tenant-context.js";

export function requireTeacherEntry(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const roles = await getTenantRoleCodes(req.user!.id, requireCurrentTenantId());
    if (!roles.includes("TEACHER")) {
      res
        .status(403)
        .json({
          code: "TEACHER_ENTRY_REQUIRED",
          message:
            "Ces informations sont saisies par les enseignants. L'administration dispose d'un accès en consultation.",
        });
      return;
    }
    next();
  })().catch(next);
}
