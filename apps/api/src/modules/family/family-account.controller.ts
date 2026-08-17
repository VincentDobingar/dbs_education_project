import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as familyAccountService from "./family-account.service.js";
import { createFamilyAccountSchema, updateFamilyAccountSchema } from "./family-account.validation.js";

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
  }
  return req.user.id;
}

export function createFamilyAccount(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const userId = requireUserId(req);
    const input = createFamilyAccountSchema.parse(req.body);
    const familyAccount = await familyAccountService.createFamilyAccount(userId, input);
    res.status(201).json(familyAccount);
  })().catch(next);
}

export function getFamilyAccount(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const userId = requireUserId(req);
    const familyAccount = await familyAccountService.requireFamilyAccountForUser(userId);
    res.status(200).json(familyAccount);
  })().catch(next);
}

export function updateFamilyAccount(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const userId = requireUserId(req);
    const input = updateFamilyAccountSchema.parse(req.body);
    const familyAccount = await familyAccountService.updateFamilyAccount(userId, input);
    res.status(200).json(familyAccount);
  })().catch(next);
}
