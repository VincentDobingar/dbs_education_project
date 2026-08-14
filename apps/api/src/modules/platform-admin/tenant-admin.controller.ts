import type { NextFunction, Request, Response } from "express";

import { resolveActor } from "./platform-actor.js";
import * as tenantAdminService from "./tenant-admin.service.js";
import { justifiedActionSchema, listPlatformTenantsQuerySchema } from "./tenant-admin.validation.js";

export function listPlatformTenants(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listPlatformTenantsQuerySchema.parse(req.query);
    const tenants = await tenantAdminService.listPlatformTenants(query);
    res.status(200).json(tenants);
  })().catch(next);
}

export function getPlatformTenant(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const tenant = await tenantAdminService.requirePlatformTenant(req.params.id as string);
    res.status(200).json(tenant);
  })().catch(next);
}

export function verifyTenant(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = justifiedActionSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification);
    const tenant = await tenantAdminService.verifyTenant(req.params.id as string, actor);
    res.status(200).json(tenant);
  })().catch(next);
}

export function rejectTenant(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = justifiedActionSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification);
    const tenant = await tenantAdminService.rejectTenant(req.params.id as string, actor);
    res.status(200).json(tenant);
  })().catch(next);
}

export function suspendTenant(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = justifiedActionSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification);
    const tenant = await tenantAdminService.suspendTenant(req.params.id as string, actor);
    res.status(200).json(tenant);
  })().catch(next);
}

export function reactivateTenant(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = justifiedActionSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification);
    const tenant = await tenantAdminService.reactivateTenant(req.params.id as string, actor);
    res.status(200).json(tenant);
  })().catch(next);
}
