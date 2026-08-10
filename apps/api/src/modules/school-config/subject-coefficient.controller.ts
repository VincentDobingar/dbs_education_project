import type { NextFunction, Request, Response } from "express";

import * as subjectCoefficientService from "./subject-coefficient.service.js";
import { setSubjectCoefficientSchema } from "./subject-coefficient.validation.js";

export function setSubjectCoefficient(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = setSubjectCoefficientSchema.parse(req.body);
    const coefficient = await subjectCoefficientService.setSubjectCoefficient(req.params.id as string, input);
    res.status(200).json(coefficient);
  })().catch(next);
}

export function listSubjectCoefficients(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const coefficients = await subjectCoefficientService.listSubjectCoefficients(req.params.id as string);
    res.status(200).json(coefficients);
  })().catch(next);
}

export function removeSubjectCoefficient(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    await subjectCoefficientService.removeSubjectCoefficient(req.params.coefficientId as string);
    res.status(204).send();
  })().catch(next);
}
