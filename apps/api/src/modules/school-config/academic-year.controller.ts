import type { NextFunction, Request, Response } from "express";

import * as academicYearService from "./academic-year.service.js";
import {
  createAcademicPeriodSchema,
  createAcademicYearSchema,
  updateAcademicYearSchema,
} from "./academic-year.validation.js";

export function createAcademicYear(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createAcademicYearSchema.parse(req.body);
    const year = await academicYearService.createAcademicYear(input);
    res.status(201).json(year);
  })().catch(next);
}

export function listAcademicYears(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const years = await academicYearService.listAcademicYears();
    res.status(200).json(years);
  })().catch(next);
}

export function updateAcademicYear(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateAcademicYearSchema.parse(req.body);
    const year = await academicYearService.updateAcademicYear(req.params.id as string, input);
    res.status(200).json(year);
  })().catch(next);
}

export function setCurrentAcademicYear(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const year = await academicYearService.setCurrentAcademicYear(req.params.id as string);
    res.status(200).json(year);
  })().catch(next);
}

export function createAcademicPeriod(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createAcademicPeriodSchema.parse(req.body);
    const period = await academicYearService.createAcademicPeriod(req.params.id as string, input);
    res.status(201).json(period);
  })().catch(next);
}

export function listAcademicPeriods(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const periods = await academicYearService.listAcademicPeriods(req.params.id as string);
    res.status(200).json(periods);
  })().catch(next);
}
