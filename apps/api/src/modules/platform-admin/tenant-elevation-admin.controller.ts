import type { NextFunction, Request, Response } from "express";

import { resolveActor } from "./platform-actor.js";
import { justifiedActionSchema } from "./tenant-admin.validation.js";
import * as tenantElevationAdminService from "./tenant-elevation-admin.service.js";
import { elevateInTenantSchema } from "./tenant-elevation-admin.validation.js";

export function listTenantElevations(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const elevations = await tenantElevationAdminService.listTenantElevations(req.params.id as string);
    res.status(200).json(elevations);
  })().catch(next);
}

export function elevateInTenant(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = elevateInTenantSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification);
    const elevation = await tenantElevationAdminService.elevateInTenant(
      req.params.id as string,
      input,
      actor,
    );
    res.status(201).json(elevation);
  })().catch(next);
}

export function revokeElevation(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = justifiedActionSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification);
    await tenantElevationAdminService.revokeElevation(
      req.params.id as string,
      req.params.userRoleId as string,
      actor,
    );
    res.status(204).send();
  })().catch(next);
}
