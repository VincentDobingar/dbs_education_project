import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";
import { saveUploadedImage } from "../../lib/file-storage.js";

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

export function uploadLogo(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    if (!req.file) {
      throw new AppError(
        400,
        "LOGO_FILE_REQUIRED",
        "Expected a JPEG or PNG image under the field name 'logo'",
      );
    }
    const url = await saveUploadedImage(req.file.buffer, req.file.mimetype, "tenant-logos");
    res.status(200).json({ url });
  })().catch(next);
}
