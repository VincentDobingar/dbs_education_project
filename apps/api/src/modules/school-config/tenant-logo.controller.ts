import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";
import { saveUploadedImage } from "../../lib/file-storage.js";

import * as tenantLogoService from "./tenant-logo.service.js";
import { setTenantLogoSchema } from "./tenant-logo.validation.js";

export function getTenantLogo(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const logo = await tenantLogoService.getTenantLogo();
    res.status(200).json(logo);
  })().catch(next);
}

export function setTenantLogo(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = setTenantLogoSchema.parse(req.body);
    const logo = await tenantLogoService.setTenantLogo(input);
    res.status(200).json(logo);
  })().catch(next);
}

export function uploadTenantLogo(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.file) {
      throw new AppError(
        400,
        "LOGO_FILE_REQUIRED",
        "Expected a JPEG or PNG image under the field name 'logo'",
      );
    }
    const logoUrl = await saveUploadedImage(req.file.buffer, req.file.mimetype, "tenant-logos");
    const logo = await tenantLogoService.setTenantLogo({ logoUrl });
    res.status(200).json(logo);
  })().catch(next);
}
