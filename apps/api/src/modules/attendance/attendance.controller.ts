import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as attendanceService from "./attendance.service.js";
import {
  justifyAbsenceSchema,
  listAttendanceQuerySchema,
  recordRollCallSchema,
} from "./attendance.validation.js";

export function recordRollCall(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const input = recordRollCallSchema.parse(req.body);
    const attendance = await attendanceService.recordRollCall(input, req.user.id);
    res.status(200).json(attendance);
  })().catch(next);
}

export function listAttendance(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listAttendanceQuerySchema.parse(req.query);
    const attendance = await attendanceService.listAttendance(query);
    res.status(200).json(attendance);
  })().catch(next);
}

export function justifyAbsence(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = justifyAbsenceSchema.parse(req.body);
    const attendance = await attendanceService.justifyAbsence(req.params.id as string, input);
    res.status(200).json(attendance);
  })().catch(next);
}
