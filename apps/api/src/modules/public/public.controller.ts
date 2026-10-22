import type { NextFunction, Request, Response } from "express";

import * as publicService from "./public.service.js";

// Données publiques et peu changeantes : cache navigateur/CDN de 10 minutes.
const CACHE_CONTROL = "public, max-age=600";

export function listCountries(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    res
      .set("Cache-Control", CACHE_CONTROL)
      .status(200)
      .json(await publicService.listPublicCountries());
  })().catch(next);
}

export function getPricing(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    res
      .set("Cache-Control", CACHE_CONTROL)
      .status(200)
      .json(await publicService.getPublicPricing());
  })().catch(next);
}
