import type { NextFunction, Request, Response } from "express";

import { resolveActor } from "./platform-actor.js";
import * as platformSettingAdminService from "./platform-setting-admin.service.js";
import {
  deletePlatformSettingSchema,
  upsertPlatformSettingSchema,
} from "./platform-setting-admin.validation.js";

export function listPlatformSettings(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const settings = await platformSettingAdminService.listPlatformSettings();
    res.status(200).json(settings);
  })().catch(next);
}

export function getPlatformSetting(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const setting = await platformSettingAdminService.requirePlatformSetting(req.params.key as string);
    res.status(200).json(setting);
  })().catch(next);
}

export function upsertPlatformSetting(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = upsertPlatformSettingSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification ?? "");
    const setting = await platformSettingAdminService.upsertPlatformSetting(
      req.params.key as string,
      input,
      actor,
    );
    res.status(200).json(setting);
  })().catch(next);
}

export function deletePlatformSetting(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = deletePlatformSettingSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification ?? "");
    await platformSettingAdminService.deletePlatformSetting(req.params.key as string, actor);
    res.status(204).send();
  })().catch(next);
}
