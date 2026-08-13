import type { NextFunction, Request, Response } from "express";

import { getStudentFinancialSituation } from "./financial-situation.service.js";
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
    const invoice = await studentInvoiceService.cancelStudentInvoice(req.params.id as string);
    res.status(200).json(invoice);
  })().catch(next);
}

export function getStudentFinancialSituationHandler(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const situation = await getStudentFinancialSituation(req.params.studentId as string);
    res.status(200).json(situation);
  })().catch(next);
}
