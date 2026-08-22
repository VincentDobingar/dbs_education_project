import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as leaveRequestService from "./leave-request.service.js";
import { createLeaveRequestSchema, decideLeaveRequestSchema } from "./leave-request.validation.js";

export function createLeaveRequest(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createLeaveRequestSchema.parse(req.body);
    const leaveRequest = await leaveRequestService.createLeaveRequest(req.params.employeeId as string, input);
    res.status(201).json(leaveRequest);
  })().catch(next);
}

export function listLeaveRequests(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const leaveRequests = await leaveRequestService.listLeaveRequests(req.params.employeeId as string);
    res.status(200).json(leaveRequests);
  })().catch(next);
}

export function decideLeaveRequest(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const input = decideLeaveRequestSchema.parse(req.body);
    const leaveRequest = await leaveRequestService.decideLeaveRequest(
      req.params.employeeId as string,
      req.params.id as string,
      input,
      req.user.id,
    );
    res.status(200).json(leaveRequest);
  })().catch(next);
}
