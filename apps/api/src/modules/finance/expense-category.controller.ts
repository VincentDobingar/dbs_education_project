import type { NextFunction, Request, Response } from "express";

import * as expenseCategoryService from "./expense-category.service.js";
import { createExpenseCategorySchema } from "./expense-category.validation.js";

export function createExpenseCategory(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createExpenseCategorySchema.parse(req.body);
    const category = await expenseCategoryService.createExpenseCategory(input);
    res.status(201).json(category);
  })().catch(next);
}

export function listExpenseCategories(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const categories = await expenseCategoryService.listExpenseCategories();
    res.status(200).json(categories);
  })().catch(next);
}
