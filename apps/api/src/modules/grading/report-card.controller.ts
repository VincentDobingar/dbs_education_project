import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import { generateReportCardPdf } from "./report-card-pdf.service.js";
import * as reportCardService from "./report-card.service.js";
import { generateReportCardsSchema, listReportCardsQuerySchema } from "./report-card.validation.js";

export function generateReportCards(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = generateReportCardsSchema.parse(req.body);
    const reportCards = await reportCardService.generateReportCards(input);
    res.status(200).json(reportCards);
  })().catch(next);
}

export function listReportCards(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listReportCardsQuerySchema.parse(req.query);
    const reportCards = await reportCardService.listReportCards(query);
    res.status(200).json(reportCards);
  })().catch(next);
}

export function getReportCard(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const reportCard = await reportCardService.requireReportCard(req.params.id as string);
    res.status(200).json(reportCard);
  })().catch(next);
}

export function getReportCardPdf(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.tenant) {
      throw new AppError(400, "TENANT_REQUIRED", "This route must be called on a tenant subdomain");
    }

    const reportCardId = req.params.id as string;
    const pdf = await generateReportCardPdf(reportCardId, req.tenant.name);

    res
      .status(200)
      .set("Content-Type", "application/pdf")
      .set("Content-Disposition", `inline; filename="bulletin-${reportCardId}.pdf"`)
      .send(pdf);
  })().catch(next);
}
