import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";
import { resolveTenantActor } from "../../lib/tenant-actor.js";

import * as activationService from "./activation-invitation.service.js";
import {
  createInvitationSchema,
  listInvitationsQuerySchema,
  redeemActivationSchema,
} from "./activation-invitation.validation.js";

export function createInvitation(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const input = createInvitationSchema.parse(req.body);
    const result = await activationService.createInvitation(input, req.user.id);
    res.status(201).json(result);
  })().catch(next);
}

export function listInvitations(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listInvitationsQuerySchema.parse(req.query);
    const invitations = await activationService.listInvitations(query);
    res.status(200).json(invitations);
  })().catch(next);
}

export function revokeInvitation(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const actor = await resolveTenantActor(req);
    const invitation = await activationService.revokeInvitation(req.params.id as string, actor);
    res.status(200).json(invitation);
  })().catch(next);
}

export function redeemActivation(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const input = redeemActivationSchema.parse(req.body);
    const result = await activationService.redeemActivation(input.code, req.user.id);
    res.status(200).json(result);
  })().catch(next);
}
