import type { StudentPayment, StudentPaymentRefund, StudentReceipt } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma, withTenantSession } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";
import { generateReference } from "../payments/reference.js";

import { requireStudentInvoice } from "./student-invoice.service.js";
import type { RecordCashPaymentInput, RefundStudentPaymentInput } from "./student-payment.validation.js";

export type StudentPaymentWithReceipt = StudentPayment & { receipt: StudentReceipt | null };

/** Never trust a client-supplied employee id for "who recorded this cash payment". */
async function resolveActingEmployeeId(userId: string): Promise<string | undefined> {
  const employee = await prisma.employee.findFirst({ where: { userId } });
  return employee?.id;
}

/**
 * Cash only for this slice — the only operator actually wired end-to-end so far
 * (same state as the SaaS billing flow in Phase 3: Mobile Money adapters exist as a
 * template but none is registered). Electronic student-fee payments would reuse the
 * PaymentIntent/PaymentTransaction pipeline via its existing studentInvoiceId field,
 * left for a later slice.
 *
 * Payment + balance update + receipt happen in one transaction (§23: "utiliser des
 * transactions pour les opérations financières") — never three separate writes that
 * could leave the invoice balance and the receipt out of sync.
 */
export async function recordCashPayment(
  invoiceId: string,
  input: RecordCashPaymentInput,
  actingUserId: string,
): Promise<StudentPaymentWithReceipt> {
  const invoice = await requireStudentInvoice(invoiceId);
  if (invoice.status === "DRAFT") {
    throw new AppError(400, "INVOICE_NOT_ISSUED", "Cannot record a payment against a DRAFT invoice");
  }
  if (invoice.status === "CANCELLED") {
    throw new AppError(409, "INVOICE_CANCELLED", "Cannot record a payment against a cancelled invoice");
  }
  if (invoice.status === "PAID") {
    throw new AppError(409, "INVOICE_ALREADY_PAID", "This invoice is already fully paid");
  }

  const outstandingCents = invoice.totalCents - invoice.paidCents;
  if (input.amountCents > outstandingCents) {
    throw new AppError(
      400,
      "AMOUNT_EXCEEDS_BALANCE",
      `Payment of ${input.amountCents} exceeds the outstanding balance of ${outstandingCents}`,
    );
  }

  const recordedByEmployeeId = await resolveActingEmployeeId(actingUserId);
  if (!recordedByEmployeeId) {
    throw new AppError(
      403,
      "EMPLOYEE_RECORD_REQUIRED",
      "Only a staff member with a linked employee record can record a cash payment",
    );
  }

  const tenantId = requireCurrentTenantId();
  const newPaidCents = invoice.paidCents + input.amountCents;
  const newStatus = newPaidCents >= invoice.totalCents ? "PAID" : "PARTIALLY_PAID";

  return withTenantSession(tenantId, async (tx) => {
    const payment = await tx.studentPayment.create({
      data: {
        tenantId,
        studentInvoiceId: invoiceId,
        amountCents: input.amountCents,
        method: "CASH",
        recordedByEmployeeId,
      },
    });

    await tx.studentInvoice.update({
      where: { id: invoiceId },
      data: { paidCents: newPaidCents, status: newStatus },
    });

    const receipt = await tx.studentReceipt.create({
      data: {
        tenantId,
        studentPaymentId: payment.id,
        number: generateReference("REC"),
      },
    });

    return { ...payment, receipt };
  });
}

export async function listPaymentsForInvoice(invoiceId: string): Promise<StudentPaymentWithReceipt[]> {
  await requireStudentInvoice(invoiceId);
  return prisma.studentPayment.findMany({
    where: { studentInvoiceId: invoiceId },
    include: { receipt: true },
    orderBy: { paidAt: "asc" },
  });
}

/** §26 : « consulter ses reçus » côté portail élève. */
export async function listReceiptsForStudent(
  studentId: string,
): Promise<(StudentReceipt & { payment: StudentPayment })[]> {
  return prisma.studentReceipt.findMany({
    where: { payment: { invoice: { studentId } } },
    include: { payment: true },
    orderBy: { issuedAt: "desc" },
  });
}

export async function requireReceipt(id: string): Promise<StudentReceipt & { payment: StudentPayment }> {
  const receipt = await prisma.studentReceipt.findUnique({ where: { id }, include: { payment: true } });
  if (!receipt) {
    throw new AppError(404, "RECEIPT_NOT_FOUND", `Receipt not found: ${id}`);
  }
  return receipt;
}

export async function requireStudentPayment(id: string): Promise<StudentPayment> {
  const payment = await prisma.studentPayment.findUnique({ where: { id } });
  if (!payment) {
    throw new AppError(404, "PAYMENT_NOT_FOUND", `Student payment not found: ${id}`);
  }
  return payment;
}

/**
 * Append-only refund trail (§23) : a payment can be refunded partially, several
 * times, capped at what hasn't been refunded yet. Unblocks cancelStudentInvoice's
 * "refund the payments first" guard once an invoice's paidCents reaches 0.
 */
export async function refundStudentPayment(
  paymentId: string,
  input: RefundStudentPaymentInput,
  actingUserId: string,
): Promise<StudentPaymentRefund> {
  const payment = await requireStudentPayment(paymentId);

  const existingRefunds = await prisma.studentPaymentRefund.findMany({
    where: { studentPaymentId: paymentId },
  });
  const alreadyRefundedCents = existingRefunds.reduce((sum, refund) => sum + refund.amountCents, 0);
  const refundableCents = payment.amountCents - alreadyRefundedCents;
  if (input.amountCents > refundableCents) {
    throw new AppError(
      400,
      "REFUND_EXCEEDS_PAYMENT",
      `Refund of ${input.amountCents} exceeds the refundable amount of ${refundableCents}`,
    );
  }

  const refundedByEmployeeId = await resolveActingEmployeeId(actingUserId);
  if (!refundedByEmployeeId) {
    throw new AppError(
      403,
      "EMPLOYEE_RECORD_REQUIRED",
      "Only a staff member with a linked employee record can refund a payment",
    );
  }

  const tenantId = requireCurrentTenantId();

  return withTenantSession(tenantId, async (tx) => {
    const refund = await tx.studentPaymentRefund.create({
      data: {
        tenantId,
        studentPaymentId: paymentId,
        amountCents: input.amountCents,
        reason: input.reason,
        refundedByEmployeeId,
      },
    });

    const invoice = await tx.studentInvoice.findUniqueOrThrow({ where: { id: payment.studentInvoiceId } });
    const newPaidCents = Math.max(invoice.paidCents - input.amountCents, 0);

    await tx.studentInvoice.update({
      where: { id: payment.studentInvoiceId },
      data: { paidCents: newPaidCents, status: newPaidCents === 0 ? "ISSUED" : "PARTIALLY_PAID" },
    });

    return refund;
  });
}

export async function listRefundsForPayment(paymentId: string): Promise<StudentPaymentRefund[]> {
  await requireStudentPayment(paymentId);
  return prisma.studentPaymentRefund.findMany({
    where: { studentPaymentId: paymentId },
    orderBy: { refundedAt: "desc" },
  });
}
