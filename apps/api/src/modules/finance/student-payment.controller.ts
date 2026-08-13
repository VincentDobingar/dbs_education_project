import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import { generateReceiptPdf } from "./receipt-pdf.service.js";
import * as studentPaymentService from "./student-payment.service.js";
import { recordCashPaymentSchema, refundStudentPaymentSchema } from "./student-payment.validation.js";

export function recordCashPayment(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const input = recordCashPaymentSchema.parse(req.body);
    const payment = await studentPaymentService.recordCashPayment(
      req.params.id as string,
      input,
      req.user.id,
    );
    res.status(201).json(payment);
  })().catch(next);
}

export function listPaymentsForInvoice(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const payments = await studentPaymentService.listPaymentsForInvoice(req.params.id as string);
    res.status(200).json(payments);
  })().catch(next);
}

export function getReceipt(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const receipt = await studentPaymentService.requireReceipt(req.params.id as string);
    res.status(200).json(receipt);
  })().catch(next);
}

export function refundStudentPayment(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const input = refundStudentPaymentSchema.parse(req.body);
    const refund = await studentPaymentService.refundStudentPayment(
      req.params.paymentId as string,
      input,
      req.user.id,
    );
    res.status(201).json(refund);
  })().catch(next);
}

export function listRefundsForPayment(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const refunds = await studentPaymentService.listRefundsForPayment(req.params.paymentId as string);
    res.status(200).json(refunds);
  })().catch(next);
}

export function getReceiptPdf(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.tenant) {
      throw new AppError(400, "TENANT_REQUIRED", "This route must be called on a tenant subdomain");
    }

    const receiptId = req.params.id as string;
    const pdf = await generateReceiptPdf(receiptId, req.tenant.name);

    res
      .status(200)
      .set("Content-Type", "application/pdf")
      .set("Content-Disposition", `inline; filename="recu-${receiptId}.pdf"`)
      .send(pdf);
  })().catch(next);
}
