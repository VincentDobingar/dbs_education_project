import type { NextFunction, Request, Response } from "express";

import { resolveActor } from "./platform-actor.js";
import { justifiedActionSchema } from "./tenant-admin.validation.js";
import * as tenantUserAdminService from "./tenant-user-admin.service.js";
import {
  grantPlatformTenantRoleSchema,
  invitePlatformTenantUserSchema,
  sendAccessEmailSchema,
  updatePlatformTenantMembershipSchema,
} from "./tenant-user-admin.validation.js";

export function listTenantUsers(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const users = await tenantUserAdminService.listPlatformTenantUsers(req.params.id as string);
    res.status(200).json(users);
  })().catch(next);
}

export function inviteTenantUser(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = invitePlatformTenantUserSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification);
    const result = await tenantUserAdminService.invitePlatformTenantUser(
      req.params.id as string,
      input,
      actor,
    );
    res.status(201).json(result);
  })().catch(next);
}

export function grantRole(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = grantPlatformTenantRoleSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification);
    await tenantUserAdminService.grantPlatformTenantRole(
      req.params.id as string,
      req.params.userId as string,
      input.roleCode,
      actor,
    );
    res.status(204).send();
  })().catch(next);
}

export function revokeRole(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = justifiedActionSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification);
    await tenantUserAdminService.revokePlatformTenantRole(
      req.params.id as string,
      req.params.userId as string,
      req.params.roleCode as string,
      actor,
    );
    res.status(204).send();
  })().catch(next);
}

export function updateMembershipStatus(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updatePlatformTenantMembershipSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification);
    await tenantUserAdminService.updatePlatformTenantMembershipStatus(
      req.params.id as string,
      req.params.userId as string,
      input.status,
      actor,
    );
    res.status(204).send();
  })().catch(next);
}

export function sendAccessEmail(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = sendAccessEmailSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification);
    await tenantUserAdminService.sendPlatformTenantUserAccessEmail(
      req.params.id as string,
      req.params.userId as string,
      input.locale,
      actor,
    );
    res.status(204).send();
  })().catch(next);
}
