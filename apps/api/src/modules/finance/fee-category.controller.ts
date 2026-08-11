import type { NextFunction, Request, Response } from "express";

import * as feeCategoryService from "./fee-category.service.js";
import { createFeeCategorySchema } from "./fee-category.validation.js";

export function createFeeCategory(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createFeeCategorySchema.parse(req.body);
    const feeCategory = await feeCategoryService.createFeeCategory(input);
    res.status(201).json(feeCategory);
  })().catch(next);
}

export function listFeeCategories(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const feeCategories = await feeCategoryService.listFeeCategories();
    res.status(200).json(feeCategories);
  })().catch(next);
}
