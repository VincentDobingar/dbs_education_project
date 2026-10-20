import type { NextFunction, Request, Response } from "express";

import { userHasPermission } from "../../lib/authorization.js";
import { AppError } from "../../lib/errors.js";

import * as catalogService from "./catalog.service.js";
import { importCatalogItemsSchema, listCatalogQuerySchema } from "./catalog.validation.js";

export function getCatalogContext(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    res.status(200).json({ countryIsoCode: await catalogService.getTenantCountryIsoCode() });
  })().catch(next);
}

export function listCatalogItems(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listCatalogQuerySchema.parse(req.query);
    const items = await catalogService.listCatalogItems(query.kind);
    res.status(200).json(items);
  })().catch(next);
}

/**
 * Même permission que la création manuelle de l'élément concerné : les catégories
 * de frais relèvent de finance.write (finance.routes.ts), tout le reste de
 * tenant.settings.manage (school-config / grading).
 */
export function importCatalogItems(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = importCatalogItemsSchema.parse(req.body);
    const permission = input.kind === "FEE_CATEGORY" ? "finance.write" : "tenant.settings.manage";
    if (!req.user || !(await userHasPermission(req.user.id, req.tenant?.id ?? null, permission))) {
      throw new AppError(403, "PERMISSION_DENIED", `Missing permission: ${permission}`);
    }

    const result = await catalogService.importCatalogItems(input);
    res.status(200).json(result);
  })().catch(next);
}
