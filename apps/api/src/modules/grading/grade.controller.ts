import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as gradeService from "./grade.service.js";
import { correctGradeSchema, listStudentGradesQuerySchema, setGradesSchema } from "./grade.validation.js";

export function setGrades(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const input = setGradesSchema.parse(req.body);
    const grades = await gradeService.setGrades(req.params.id as string, input, req.user.id);
    res.status(200).json(grades);
  })().catch(next);
}

export function listGradesForAssessment(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const grades = await gradeService.listGradesForAssessment(req.params.id as string);
    res.status(200).json(grades);
  })().catch(next);
}

export function listGradesForStudent(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listStudentGradesQuerySchema.parse(req.query);
    const grades = await gradeService.listGradesForStudent(req.params.studentId as string, query);
    res.status(200).json(grades);
  })().catch(next);
}

export function correctGrade(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const input = correctGradeSchema.parse(req.body);
    const grade = await gradeService.correctGrade(req.params.id as string, input, req.user.id);
    res.status(200).json(grade);
  })().catch(next);
}
