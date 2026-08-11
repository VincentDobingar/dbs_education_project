import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as expenseService from "./expense.service.js";
import { createExpenseSchema, listExpensesQuerySchema, updateExpenseSchema } from "./expense.validation.js";

export function createExpense(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const input = createExpenseSchema.parse(req.body);
    const expense = await expenseService.createExpense(input, req.user.id);
    res.status(201).json(expense);
  })().catch(next);
}

export function listExpenses(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listExpensesQuerySchema.parse(req.query);
    const expenses = await expenseService.listExpenses(query);
    res.status(200).json(expenses);
  })().catch(next);
}

export function updateExpense(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateExpenseSchema.parse(req.body);
    const expense = await expenseService.updateExpense(req.params.id as string, input);
    res.status(200).json(expense);
  })().catch(next);
}

export function removeExpense(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    await expenseService.removeExpense(req.params.id as string);
    res.status(204).send();
  })().catch(next);
}
