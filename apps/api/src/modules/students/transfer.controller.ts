import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as transferService from "./transfer.service.js";
import { completeStudentTransferSchema, requestStudentTransferSchema } from "./transfer.validation.js";

export function requestTransfer(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }

    const input = requestStudentTransferSchema.parse(req.body);
    const transfer = await transferService.requestTransfer(req.user.id, input);
    res.status(201).json(transfer);
  })().catch(next);
}

export function listTransfers(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const direction = req.query.direction === "incoming" ? "incoming" : "outgoing";
    const transfers = await transferService.listTransfers(direction);
    res.status(200).json(transfers);
  })().catch(next);
}

export function approveTransfer(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const transfer = await transferService.approveTransfer(req.params.id as string);
    res.status(200).json(transfer);
  })().catch(next);
}

export function rejectTransfer(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const transfer = await transferService.rejectTransfer(req.params.id as string);
    res.status(200).json(transfer);
  })().catch(next);
}

export function completeTransfer(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = completeStudentTransferSchema.parse(req.body);
    const result = await transferService.completeTransfer(req.params.id as string, input);
    res.status(200).json(result);
  })().catch(next);
}
