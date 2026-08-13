import type { NextFunction, Request, Response } from "express";

import { getPlatformRoleCodes } from "../../lib/authorization.js";
import { AppError } from "../../lib/errors.js";

import * as tenantAdminService from "./tenant-admin.service.js";
import { justifiedActionSchema, listPlatformTenantsQuerySchema } from "./tenant-admin.validation.js";

async function resolveActor(
  req: Request,
  justification: string,
): Promise<{ actorUserId: string; actorRoleCode?: string; justification: string }> {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
  }
  const roleCodes = await getPlatformRoleCodes(req.user.id);
  return {
    actorUserId: req.user.id,
    ...(roleCodes[0] ? { actorRoleCode: roleCodes[0] } : {}),
    justification,
  };
}

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
