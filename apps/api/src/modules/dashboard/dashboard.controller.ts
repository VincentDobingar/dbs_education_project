import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as accountantDashboardService from "./accountant-dashboard.service.js";
import { dashboardWindowQuerySchema } from "./dashboard.validation.js";
import * as directionDashboardService from "./direction-dashboard.service.js";
import * as teacherDashboardService from "./teacher-dashboard.service.js";

export function getDirectionDashboard(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = dashboardWindowQuerySchema.parse(req.query);
    const dashboard = await directionDashboardService.getDirectionDashboard(query);
    res.status(200).json(dashboard);
  })().catch(next);
}

export function getAccountantDashboard(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = dashboardWindowQuerySchema.parse(req.query);
    const dashboard = await accountantDashboardService.getAccountantDashboard(query);
    res.status(200).json(dashboard);
  })().catch(next);
}

export function getTeacherDashboard(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const dashboard = await teacherDashboardService.getTeacherDashboard(req.user.id);
    res.status(200).json(dashboard);
  })().catch(next);
}
