import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as cashSessionService from "./cash-session.service.js";
import {
  closeCashSessionSchema,
  listCashSessionsQuerySchema,
  openCashSessionSchema,
} from "./cash-session.validation.js";

export function openCashSession(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const input = openCashSessionSchema.parse(req.body);
    const session = await cashSessionService.openCashSession(input, req.user.id);
    res.status(201).json(session);
  })().catch(next);
}

export function closeCashSession(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const input = closeCashSessionSchema.parse(req.body);
    const session = await cashSessionService.closeCashSession(req.params.id as string, input, req.user.id);
    res.status(200).json(session);
  })().catch(next);
}

export function getCashSession(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const session = await cashSessionService.requireCashSession(req.params.id as string);
    res.status(200).json(session);
  })().catch(next);
}

export function listCashSessions(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listCashSessionsQuerySchema.parse(req.query);
    const sessions = await cashSessionService.listCashSessions(query);
    res.status(200).json(sessions);
  })().catch(next);
}
