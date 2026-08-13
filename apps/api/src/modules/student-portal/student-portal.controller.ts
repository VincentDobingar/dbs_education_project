import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as studentPortalService from "./student-portal.service.js";
import { listMyReportCardsQuerySchema } from "./student-portal.validation.js";

function requireTenant(req: Request): NonNullable<Request["tenant"]> {
  if (!req.tenant) {
    throw new AppError(400, "TENANT_REQUIRED", "This route requires a linked student account");
  }
  return req.tenant;
}

export function getProfile(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const profile = await studentPortalService.getStudentProfile(req.params.studentId as string);
    res.status(200).json(profile);
  })().catch(next);
}

export function getTimetable(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const entries = await studentPortalService.getMyTimetable(req.params.studentId as string);
    res.status(200).json(entries);
  })().catch(next);
}

export function getReportCards(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listMyReportCardsQuerySchema.parse(req.query);
    const reportCards = await studentPortalService.getMyReportCards(req.params.studentId as string, query);
    res.status(200).json(reportCards);
  })().catch(next);
}

export function getReportCard(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const reportCard = await studentPortalService.getMyReportCard(
      req.params.studentId as string,
      req.params.id as string,
    );
    res.status(200).json(reportCard);
  })().catch(next);
}

export function getReportCardPdf(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const tenant = requireTenant(req);
    const reportCardId = req.params.id as string;
    const pdf = await studentPortalService.getMyReportCardPdf(
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

export function getAnnouncements(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const announcements = await studentPortalService.getMyAnnouncements(req.params.studentId as string);
    res.status(200).json(announcements);
  })().catch(next);
}

export function getReceipts(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const receipts = await studentPortalService.getMyReceipts(req.params.studentId as string);
    res.status(200).json(receipts);
  })().catch(next);
}

export function getReceiptPdf(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const tenant = requireTenant(req);
    const receiptId = req.params.receiptId as string;
    const pdf = await studentPortalService.getMyReceiptPdf(
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
