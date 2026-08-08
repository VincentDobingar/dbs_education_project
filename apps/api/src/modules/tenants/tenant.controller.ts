import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as tenantService from "./tenant.service.js";
import { onboardTenantSchema } from "./tenant.validation.js";

export function onboardTenant(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }

    const input = onboardTenantSchema.parse(req.body);
    const result = await tenantService.onboardTenant(req.user.id, input);

    res.status(201).json(result);
  })().catch(next);
}
