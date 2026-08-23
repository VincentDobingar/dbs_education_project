import type { NextFunction, Request, Response } from "express";

import * as cafeteriaService from "./cafeteria.service.js";
import {
  createEnrollmentSchema,
  createMealPlanSchema,
  createMenuSchema,
  listEnrollmentsQuerySchema,
  listMealAttendanceQuerySchema,
  listMenusQuerySchema,
  recordMealAttendanceSchema,
  updateMealPlanSchema,
  updateMenuSchema,
} from "./cafeteria.validation.js";

export function createMenu(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createMenuSchema.parse(req.body);
    const menu = await cafeteriaService.createMenu(input);
    res.status(201).json(menu);
  })().catch(next);
}

export function listMenus(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listMenusQuerySchema.parse(req.query);
    const menus = await cafeteriaService.listMenus(query);
    res.status(200).json(menus);
  })().catch(next);
}

export function getMenu(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const menu = await cafeteriaService.requireMenu(req.params.id as string);
    res.status(200).json(menu);
  })().catch(next);
}

export function updateMenu(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateMenuSchema.parse(req.body);
    const menu = await cafeteriaService.updateMenu(req.params.id as string, input);
    res.status(200).json(menu);
  })().catch(next);
}

export function removeMenu(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    await cafeteriaService.removeMenu(req.params.id as string);
    res.status(204).send();
  })().catch(next);
}

export function createMealPlan(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createMealPlanSchema.parse(req.body);
    const mealPlan = await cafeteriaService.createMealPlan(input);
    res.status(201).json(mealPlan);
  })().catch(next);
}

export function listMealPlans(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const mealPlans = await cafeteriaService.listMealPlans();
    res.status(200).json(mealPlans);
  })().catch(next);
}

export function getMealPlan(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const mealPlan = await cafeteriaService.requireMealPlan(req.params.id as string);
    res.status(200).json(mealPlan);
  })().catch(next);
}

export function updateMealPlan(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateMealPlanSchema.parse(req.body);
    const mealPlan = await cafeteriaService.updateMealPlan(req.params.id as string, input);
    res.status(200).json(mealPlan);
  })().catch(next);
}

export function archiveMealPlan(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const mealPlan = await cafeteriaService.archiveMealPlan(req.params.id as string);
    res.status(200).json(mealPlan);
  })().catch(next);
}

export function createEnrollment(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createEnrollmentSchema.parse(req.body);
    const enrollment = await cafeteriaService.createEnrollment(input);
    res.status(201).json(enrollment);
  })().catch(next);
}

export function listEnrollments(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listEnrollmentsQuerySchema.parse(req.query);
    const enrollments = await cafeteriaService.listEnrollments(query);
    res.status(200).json(enrollments);
  })().catch(next);
}

export function getEnrollment(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const enrollment = await cafeteriaService.requireEnrollment(req.params.id as string);
    res.status(200).json(enrollment);
  })().catch(next);
}

export function markEnrollmentPaid(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const enrollment = await cafeteriaService.markEnrollmentPaid(req.params.id as string);
    res.status(200).json(enrollment);
  })().catch(next);
}

export function cancelEnrollment(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const enrollment = await cafeteriaService.cancelEnrollment(req.params.id as string);
    res.status(200).json(enrollment);
  })().catch(next);
}

export function recordAttendance(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = recordMealAttendanceSchema.parse(req.body);
    const attendance = await cafeteriaService.recordMealAttendance(req.params.id as string, input);
    res.status(200).json(attendance);
  })().catch(next);
}

export function listAttendance(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listMealAttendanceQuerySchema.parse(req.query);
    const attendance = await cafeteriaService.listMealAttendanceForEnrollment(req.params.id as string, query);
    res.status(200).json(attendance);
  })().catch(next);
}
