import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as parentPortalService from "./parent-portal.service.js";
import {
  listChildAttendanceQuerySchema,
  listChildReportCardsQuerySchema,
} from "./parent-portal.validation.js";

function requireTenant(req: Request): NonNullable<Request["tenant"]> {
  if (!req.tenant) {
    throw new AppError(400, "TENANT_REQUIRED", "This route requires a verified child relationship");
  }
  return req.tenant;
}

export function getChildAttendance(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listChildAttendanceQuerySchema.parse(req.query);
    const attendance = await parentPortalService.getChildAttendance(req.params.studentId as string, query);
    res.status(200).json(attendance);
  })().catch(next);
}

export function getChildReportCards(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listChildReportCardsQuerySchema.parse(req.query);
    const reportCards = await parentPortalService.getChildReportCards(req.params.studentId as string, query);
    res.status(200).json(reportCards);
  })().catch(next);
}

export function getChildReportCard(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const reportCard = await parentPortalService.getChildReportCard(
      req.params.studentId as string,
      req.params.id as string,
    );
    res.status(200).json(reportCard);
  })().catch(next);
}

export function getChildReportCardPdf(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const tenant = requireTenant(req);
    const reportCardId = req.params.id as string;
    const pdf = await parentPortalService.getChildReportCardPdf(
      req.params.studentId as string,
      reportCardId,
      tenant.name,
    );
    res
      .status(200)
      .set("Content-Type", "application/pdf")
      .set("Content-Disposition", `inline; filename="bulletin-${reportCardId}.pdf"`)
      .send(pdf);
  })().catch(next);
}

export function getChildTimetable(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const entries = await parentPortalService.getChildTimetable(req.params.studentId as string);
    res.status(200).json(entries);
  })().catch(next);
}

export function getChildAnnouncements(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const announcements = await parentPortalService.getChildAnnouncements(req.params.studentId as string);
    res.status(200).json(announcements);
  })().catch(next);
}

export function getChildFinancialSituation(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const situation = await parentPortalService.getChildFinancialSituation(req.params.studentId as string);
    res.status(200).json(situation);
  })().catch(next);
}

export function getChildReceiptPdf(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const tenant = requireTenant(req);
    const receiptId = req.params.receiptId as string;
    const pdf = await parentPortalService.getChildReceiptPdf(
      req.params.studentId as string,
      receiptId,
      tenant.name,
    );
    res
      .status(200)
      .set("Content-Type", "application/pdf")
      .set("Content-Disposition", `inline; filename="recu-${receiptId}.pdf"`)
      .send(pdf);
  })().catch(next);
}
