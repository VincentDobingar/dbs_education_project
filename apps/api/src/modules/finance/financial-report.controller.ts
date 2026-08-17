import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import { expenseReportToCsv, revenueReportToCsv } from "./financial-report-csv.service.js";
import { generateExpenseReportPdf, generateRevenueReportPdf } from "./financial-report-pdf.service.js";
import * as financialReportService from "./financial-report.service.js";
import { financialReportQuerySchema } from "./financial-report.validation.js";

function requireTenantName(req: Request): string {
  if (!req.tenant) {
    throw new AppError(400, "TENANT_REQUIRED", "This route must be called on a tenant subdomain");
  }
  return req.tenant.name;
}

export function getRevenueReport(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = financialReportQuerySchema.parse(req.query);
    const report = await financialReportService.getRevenueReport(query);
    res.status(200).json(report);
  })().catch(next);
}

export function getRevenueReportCsv(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = financialReportQuerySchema.parse(req.query);
    const report = await financialReportService.getRevenueReport(query);
    const csv = revenueReportToCsv(report);
    res
      .status(200)
      .set("Content-Type", "text/csv; charset=utf-8")
      .set("Content-Disposition", 'attachment; filename="rapport-recettes.csv"')
      .send(csv);
  })().catch(next);
}

export function getRevenueReportPdf(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const tenantName = requireTenantName(req);
    const query = financialReportQuerySchema.parse(req.query);
    const report = await financialReportService.getRevenueReport(query);
    const pdf = await generateRevenueReportPdf(report, tenantName);
    res
      .status(200)
      .set("Content-Type", "application/pdf")
      .set("Content-Disposition", 'inline; filename="rapport-recettes.pdf"')
      .send(pdf);
  })().catch(next);
}

export function getExpenseReport(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = financialReportQuerySchema.parse(req.query);
    const report = await financialReportService.getExpenseReport(query);
    res.status(200).json(report);
  })().catch(next);
}

export function getExpenseReportCsv(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = financialReportQuerySchema.parse(req.query);
    const report = await financialReportService.getExpenseReport(query);
    const csv = expenseReportToCsv(report);
    res
      .status(200)
      .set("Content-Type", "text/csv; charset=utf-8")
      .set("Content-Disposition", 'attachment; filename="rapport-depenses.csv"')
      .send(csv);
  })().catch(next);
}

export function getExpenseReportPdf(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const tenantName = requireTenantName(req);
    const query = financialReportQuerySchema.parse(req.query);
    const report = await financialReportService.getExpenseReport(query);
    const pdf = await generateExpenseReportPdf(report, tenantName);
    res
      .status(200)
      .set("Content-Type", "application/pdf")
      .set("Content-Disposition", 'inline; filename="rapport-depenses.pdf"')
      .send(pdf);
  })().catch(next);
}
