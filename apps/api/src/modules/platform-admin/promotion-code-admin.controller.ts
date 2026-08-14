import type { NextFunction, Request, Response } from "express";

import { resolveActor } from "./platform-actor.js";
import * as promotionCodeAdminService from "./promotion-code-admin.service.js";
import {
  createPromotionCodeSchema,
  listPromotionCodesQuerySchema,
  updatePromotionCodeSchema,
} from "./promotion-code-admin.validation.js";

export function listPromotionCodes(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listPromotionCodesQuerySchema.parse(req.query);
    const promotionCodes = await promotionCodeAdminService.listPromotionCodes(query);
    res.status(200).json(promotionCodes);
  })().catch(next);
}

export function createPromotionCode(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createPromotionCodeSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification ?? "");
    const promotionCode = await promotionCodeAdminService.createPromotionCode(input, actor);
    res.status(201).json(promotionCode);
  })().catch(next);
}

export function updatePromotionCode(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updatePromotionCodeSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification ?? "");
    const promotionCode = await promotionCodeAdminService.updatePromotionCode(
      req.params.id as string,
      input,
      actor,
    );
    res.status(200).json(promotionCode);
  })().catch(next);
}
