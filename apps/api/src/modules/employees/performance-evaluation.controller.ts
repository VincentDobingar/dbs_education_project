import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as performanceEvaluationService from "./performance-evaluation.service.js";
import { createPerformanceEvaluationSchema } from "./performance-evaluation.validation.js";

export function createPerformanceEvaluation(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const input = createPerformanceEvaluationSchema.parse(req.body);
    const evaluation = await performanceEvaluationService.createPerformanceEvaluation(
      req.params.employeeId as string,
      input,
      req.user.id,
    );
    res.status(201).json(evaluation);
  })().catch(next);
}

export function listPerformanceEvaluations(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const evaluations = await performanceEvaluationService.listPerformanceEvaluations(
      req.params.employeeId as string,
    );
    res.status(200).json(evaluations);
  })().catch(next);
}
