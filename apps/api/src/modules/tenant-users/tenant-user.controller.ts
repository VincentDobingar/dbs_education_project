import type { NextFunction, Request, Response } from "express";

import * as tenantUserService from "./tenant-user.service.js";
import {
  grantRoleSchema,
  inviteTenantUserSchema,
  updateMembershipStatusSchema,
} from "./tenant-user.validation.js";

export function inviteTenantUser(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = inviteTenantUserSchema.parse(req.body);
    const summary = await tenantUserService.inviteTenantUser(input);
    res.status(201).json(summary);
  })().catch(next);
}

export function listTenantUsers(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const users = await tenantUserService.listTenantUsers();
    res.status(200).json(users);
  })().catch(next);
}

export function grantRole(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = grantRoleSchema.parse(req.body);
    await tenantUserService.grantTenantRole(req.params.userId as string, input.roleCode);
    res.status(204).send();
  })().catch(next);
}

export function revokeRole(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    await tenantUserService.revokeTenantRole(req.params.userId as string, req.params.roleCode as string);
    res.status(204).send();
  })().catch(next);
}

export function updateMembershipStatus(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateMembershipStatusSchema.parse(req.body);
    await tenantUserService.updateMembershipStatus(req.params.userId as string, input.status);
    res.status(204).send();
  })().catch(next);
}
