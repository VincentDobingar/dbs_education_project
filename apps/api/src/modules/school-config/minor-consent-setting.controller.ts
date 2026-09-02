import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import * as minorConsentSettingService from "./minor-consent-setting.service.js";
import { minorConsentSettingSchema } from "./minor-consent-setting.validation.js";

export function getMinorConsentSetting(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const setting = await minorConsentSettingService.getMinorConsentSetting(requireCurrentTenantId());
    res.status(200).json(setting);
  })().catch(next);
}

export function updateMinorConsentSetting(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const input = minorConsentSettingSchema.parse(req.body);
    const setting = await minorConsentSettingService.updateMinorConsentSetting(input, req.user.id);
    res.status(200).json(setting);
  })().catch(next);
}
