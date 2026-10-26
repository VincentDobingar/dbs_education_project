import type { NextFunction, Request, Response } from "express";

import * as tenantShowcaseService from "./tenant-showcase.service.js";
import { updateTenantShowcaseSchema } from "./tenant-showcase.validation.js";

export function getTenantShowcase(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    res.status(200).json(await tenantShowcaseService.getTenantShowcase());
  })().catch(next);
}

export function updateTenantShowcase(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateTenantShowcaseSchema.parse(req.body);
    res.status(200).json(await tenantShowcaseService.updateTenantShowcase(input));
  })().catch(next);
}
