import type { NextFunction, Request, Response } from "express";

import * as staffAttendanceService from "./staff-attendance.service.js";
import {
  listStaffAttendanceQuerySchema,
  recordStaffAttendanceSchema,
} from "./staff-attendance.validation.js";

export function recordStaffAttendance(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = recordStaffAttendanceSchema.parse(req.body);
    const attendance = await staffAttendanceService.recordStaffAttendance(
      req.params.employeeId as string,
      input,
    );
    res.status(200).json(attendance);
  })().catch(next);
}

export function listStaffAttendance(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listStaffAttendanceQuerySchema.parse(req.query);
    const attendances = await staffAttendanceService.listStaffAttendance(
      req.params.employeeId as string,
      query,
    );
    res.status(200).json(attendances);
  })().catch(next);
}
