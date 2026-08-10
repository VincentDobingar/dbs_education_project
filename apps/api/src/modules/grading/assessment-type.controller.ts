import type { NextFunction, Request, Response } from "express";

import * as assessmentTypeService from "./assessment-type.service.js";
import { createAssessmentTypeSchema } from "./assessment-type.validation.js";

export function createAssessmentType(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createAssessmentTypeSchema.parse(req.body);
    const assessmentType = await assessmentTypeService.createAssessmentType(input);
    res.status(201).json(assessmentType);
  })().catch(next);
}

export function listAssessmentTypes(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const assessmentTypes = await assessmentTypeService.listAssessmentTypes();
    res.status(200).json(assessmentTypes);
  })().catch(next);
}
