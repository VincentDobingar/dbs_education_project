import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";
import { resolveTenantActor } from "../../lib/tenant-actor.js";

import { getStudentFinancialSituation } from "./financial-situation.service.js";
import { generateInvoicePdf } from "./invoice-pdf.service.js";
import * as studentInvoiceService from "./student-invoice.service.js";
import { createStudentInvoiceSchema, listStudentInvoicesQuerySchema } from "./student-invoice.validation.js";

export function createStudentInvoice(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createStudentInvoiceSchema.parse(req.body);
    const invoice = await studentInvoiceService.createStudentInvoice(input);
    res.status(201).json(invoice);
  })().catch(next);
}

export function listStudentInvoices(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listStudentInvoicesQuerySchema.parse(req.query);
    const invoices = await studentInvoiceService.listStudentInvoices(query);
    res.status(200).json(invoices);
  })().catch(next);
}

export function getStudentInvoice(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const invoice = await studentInvoiceService.requireStudentInvoice(req.params.id as string);
    res.status(200).json(invoice);
  })().catch(next);
}

export function issueStudentInvoice(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const invoice = await studentInvoiceService.issueStudentInvoice(req.params.id as string);
    res.status(200).json(invoice);
  })().catch(next);
}

export function cancelStudentInvoice(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const actor = await resolveTenantActor(req);
    const invoice = await studentInvoiceService.cancelStudentInvoice(req.params.id as string, actor);
    res.status(200).json(invoice);
  })().catch(next);
}

export function getStudentFinancialSituationHandler(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const situation = await getStudentFinancialSituation(req.params.studentId as string);
    res.status(200).json(situation);
  })().catch(next);
}

export function getStudentInvoicePdf(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.tenant) throw new AppError(400, "TENANT_REQUIRED", "Tenant required");
    const invoiceId = req.params.id as string;
    const pdf = await generateInvoicePdf(invoiceId, req.tenant);
    res
      .status(200)
      .set("Content-Type", "application/pdf")
      .set("Content-Disposition", `inline; filename="facture-${invoiceId}.pdf"`)
      .send(pdf);
  })().catch(next);
}
