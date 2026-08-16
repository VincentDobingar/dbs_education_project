import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as mfaService from "./mfa.service.js";
import { disableMfaSchema, enableMfaSchema } from "./mfa.validation.js";

export function setupMfa(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }

    const result = await mfaService.setupMfa(req.user.id, req.user.email);
    res.status(200).json(result);
  })().catch(next);
}

export function enableMfa(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }

    const input = enableMfaSchema.parse(req.body);
    const recoveryCodes = await mfaService.enableMfa(req.user.id, input.code);
    res.status(200).json({ recoveryCodes });
  })().catch(next);
}

export function disableMfa(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }

    const input = disableMfaSchema.parse(req.body);
    await mfaService.disableMfa(req.user.id, input.password, input.code);
    res.status(204).send();
  })().catch(next);
}
