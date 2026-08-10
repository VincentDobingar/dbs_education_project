import type { NextFunction, Request, Response } from "express";

import * as assessmentService from "./assessment.service.js";
import {
  createAssessmentSchema,
  listAssessmentsQuerySchema,
  updateAssessmentSchema,
} from "./assessment.validation.js";

export function createAssessment(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createAssessmentSchema.parse(req.body);
    const assessment = await assessmentService.createAssessment(input);
    res.status(201).json(assessment);
  })().catch(next);
}

export function listAssessments(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listAssessmentsQuerySchema.parse(req.query);
    const assessments = await assessmentService.listAssessments(query);
    res.status(200).json(assessments);
  })().catch(next);
}

export function updateAssessment(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateAssessmentSchema.parse(req.body);
    const assessment = await assessmentService.updateAssessment(req.params.id as string, input);
    res.status(200).json(assessment);
  })().catch(next);
}

export function publishAssessment(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const assessment = await assessmentService.publishAssessment(req.params.id as string);
    res.status(200).json(assessment);
  })().catch(next);
}
