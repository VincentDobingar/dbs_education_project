import { randomUUID } from "node:crypto";

import type { PaymentMethodType, Prisma, StudentInvoice } from "@prisma/client";

import { resolveActingEmployeeId } from "../../../lib/acting-employee.js";
import { AppError } from "../../../lib/errors.js";
import { prisma, withTenantSession } from "../../../lib/prisma.js";
import { requireCurrentTenantId } from "../../../lib/tenant-context.js";
import { generateReference } from "../../payments/reference.js";
import { requireStudentRecord } from "../../students/student.service.js";

import { activateEnrollmentIfRegistrationPaid } from "./activation.js";
import { allocatePayment } from "./engine.js";

type Tx = Prisma.TransactionClient;

const OPEN_STATUSES = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] as const;

export interface AllocationLine {
  invoiceId: string;
  invoiceNumber: string;
  label: string;
  amountCents: number;
  remainingCents: number;
  paymentId: string;
  receiptId: string;
}

export interface AllocationResult {
  allocationGroupId: string;
  amountCents: number;
  method: PaymentMethodType;
  lines: AllocationLine[];
  creditCreatedCents: number;
  creditUsedCents: number;
  activatedEnrollment: boolean;
}

async function lockOpenInvoices(tx: Tx, tenantId: string, studentId: string): Promise<StudentInvoice[]> {
  await tx.$queryRaw`SELECT id FROM "StudentInvoice" WHERE "studentId" = ${studentId} AND "tenantId" = ${tenantId} AND status IN ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE') AND "deletedAt" IS NULL FOR UPDATE`;
  return tx.studentInvoice.findMany({
    where: { tenantId, studentId, deletedAt: null, status: { in: [...OPEN_STATUSES] } },
  });
}

function invoiceLabel(invoice: StudentInvoice & { items?: { description: string }[] }): string {
  if (invoice.kind === "REGISTRATION") return "Inscription";
  if (invoice.kind === "PENALTY") return "Pénalité de retard";
  if (invoice.kind === "INSTALLMENT" && invoice.installmentSequence)
    return `Tranche ${invoice.installmentSequence}`;
  return invoice.items?.[0]?.description ?? invoice.number;
}

/**
 * Applique un montant à des échéances : un StudentPayment + un reçu par échéance
 * touchée, tous rattachés au même groupe ; met à jour soldes et statuts ; active
 * l'inscription si la facture d'inscription est soldée.
 */
async function applyAllocations(
  tx: Tx,
  tenantId: string,
  allocationGroupId: string,
  invoices: StudentInvoice[],
  allocations: { invoiceId: string; amountCents: number }[],
  payment: {
    method: PaymentMethodType;
    recordedByEmployeeId: string | null;
    paymentTransactionId?: string | null;
  },
): Promise<{ lines: AllocationLine[]; activated: boolean }> {
  const byId = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const lines: AllocationLine[] = [];
  let activated = false;
  for (const allocation of allocations) {
    const invoice = byId.get(allocation.invoiceId);
    if (!invoice) continue;
    const paidCents = invoice.paidCents + allocation.amountCents;
    const status = paidCents >= invoice.totalCents ? "PAID" : "PARTIALLY_PAID";
    const created = await tx.studentPayment.create({
      data: {
        tenantId,
        studentInvoiceId: invoice.id,
        amountCents: allocation.amountCents,
        method: payment.method,
        recordedByEmployeeId: payment.recordedByEmployeeId,
        paymentTransactionId: payment.paymentTransactionId ?? null,
        allocationGroupId,
      },
    });
    await tx.studentInvoice.update({ where: { id: invoice.id }, data: { paidCents, status } });
    const receipt = await tx.studentReceipt.create({
      data: { tenantId, studentPaymentId: created.id, number: generateReference("REC") },
    });
    if (status === "PAID" && (await activateEnrollmentIfRegistrationPaid(tx, invoice.id))) activated = true;
    lines.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      label: invoiceLabel(invoice),
      amountCents: allocation.amountCents,
      remainingCents: invoice.totalCents - paidCents,
      paymentId: created.id,
      receiptId: receipt.id,
    });
    byId.set(invoice.id, { ...invoice, paidCents, status });
  }
  return { lines, activated };
}

/**
 * Consomme les avoirs de l'élève sur ses échéances ouvertes (inscription d'abord,
 * puis les plus anciennes). À appeler quand de nouvelles échéances apparaissent.
 */
export async function applyStudentCredits(tx: Tx, tenantId: string, studentId: string): Promise<number> {
  const credits = await tx.studentCredit.findMany({
    where: { tenantId, studentId, remainingCents: { gt: 0 } },
    orderBy: { createdAt: "asc" },
  });
  const available = credits.reduce((sum, credit) => sum + credit.remainingCents, 0);
  if (available === 0) return 0;
  const invoices = await lockOpenInvoices(tx, tenantId, studentId);
  const { allocations, leftoverCents } = allocatePayment(
    available,
    invoices.map((invoice) => ({
      id: invoice.id,
      kind: invoice.kind,
      outstandingCents: invoice.totalCents - invoice.paidCents,
      dueAt: invoice.dueAt,
      createdAt: invoice.createdAt,
    })),
  );
  const used = available - leftoverCents;
  if (used === 0) return 0;
  await applyAllocations(tx, tenantId, `CREDIT-${randomUUID()}`, invoices, allocations, {
    method: "CREDIT",
    recordedByEmployeeId: null,
  });
  let toConsume = used;
  for (const credit of credits) {
    if (toConsume <= 0) break;
    const take = Math.min(credit.remainingCents, toConsume);
    await tx.studentCredit.update({
      where: { id: credit.id },
      data: { remainingCents: credit.remainingCents - take },
    });
    toConsume -= take;
  }
  return used;
}

/**
 * Versement d'une famille à la caisse : réparti automatiquement (inscription
 * d'abord, puis les échéances les plus anciennes), ou affecté à une échéance
 * précise par le caissier. Le trop-perçu devient un avoir, jamais perdu.
 */
export async function recordStudentPayment(
  studentId: string,
  input: { amountCents: number; invoiceId?: string | undefined },
  actingUserId: string,
): Promise<AllocationResult> {
  await requireStudentRecord(studentId);
  const recordedByEmployeeId = await resolveActingEmployeeId(actingUserId);
  if (!recordedByEmployeeId) {
    throw new AppError(
      403,
      "EMPLOYEE_RECORD_REQUIRED",
      "Only a staff member with a linked employee record can record a cash payment",
    );
  }
  const tenantId = requireCurrentTenantId();
  const allocationGroupId = randomUUID();

  return withTenantSession(tenantId, async (tx) => {
    const creditUsedCents = await applyStudentCredits(tx, tenantId, studentId);
    const invoices = await lockOpenInvoices(tx, tenantId, studentId);
    let allocations: { invoiceId: string; amountCents: number }[];
    let leftoverCents: number;
    if (input.invoiceId) {
      const target = invoices.find((invoice) => invoice.id === input.invoiceId);
      if (!target)
        throw new AppError(404, "INVOICE_NOT_PAYABLE", "Cette échéance n'est pas ouverte au paiement");
      const outstanding = target.totalCents - target.paidCents;
      if (input.amountCents > outstanding) {
        throw new AppError(
          400,
          "AMOUNT_EXCEEDS_BALANCE",
          `Le montant dépasse le reste à payer de cette échéance (${outstanding})`,
        );
      }
      allocations = [{ invoiceId: target.id, amountCents: input.amountCents }];
      leftoverCents = 0;
    } else {
      ({ allocations, leftoverCents } = allocatePayment(
        input.amountCents,
        invoices.map((invoice) => ({
          id: invoice.id,
          kind: invoice.kind,
          outstandingCents: invoice.totalCents - invoice.paidCents,
          dueAt: invoice.dueAt,
          createdAt: invoice.createdAt,
        })),
      ));
    }
    const { lines, activated } = await applyAllocations(
      tx,
      tenantId,
      allocationGroupId,
      invoices,
      allocations,
      {
        method: "CASH",
        recordedByEmployeeId,
      },
    );
    if (leftoverCents > 0) {
      await tx.studentCredit.create({
        data: {
          tenantId,
          studentId,
          amountCents: leftoverCents,
          remainingCents: leftoverCents,
          allocationGroupId,
          reason: "Trop-perçu sur un versement",
        },
      });
    }
    return {
      allocationGroupId,
      amountCents: input.amountCents,
      method: "CASH" as const,
      lines,
      creditCreatedCents: leftoverCents,
      creditUsedCents,
      activatedEnrollment: activated,
    };
  });
}

/** Paiement en ligne confirmé (webhook) d'une échéance précise. Idempotent par transaction. */
export async function settleOnlineInvoicePayment(
  tx: Tx,
  input: {
    tenantId: string;
    invoiceId: string;
    amountCents: number;
    paymentTransactionId: string;
    method: PaymentMethodType;
  },
): Promise<void> {
  // Le webhook s'exécute hors contexte d'établissement : on ouvre la session RLS
  // de l'établissement de l'échéance pour le reste de la transaction.
  await tx.$executeRaw`SELECT set_config('app.tenant_id', ${input.tenantId}, true)`;
  const already = await tx.studentPayment.findFirst({
    where: { paymentTransactionId: input.paymentTransactionId },
  });
  if (already) return;
  const invoice = await tx.studentInvoice.findUnique({ where: { id: input.invoiceId } });
  if (!invoice || invoice.tenantId !== input.tenantId) return;
  const outstanding = Math.max(invoice.totalCents - invoice.paidCents, 0);
  const applied = Math.min(outstanding, input.amountCents);
  const groupId = randomUUID();
  if (applied > 0 && ["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status)) {
    await applyAllocations(
      tx,
      input.tenantId,
      groupId,
      [invoice],
      [{ invoiceId: invoice.id, amountCents: applied }],
      {
        method: input.method,
        recordedByEmployeeId: null,
        paymentTransactionId: input.paymentTransactionId,
      },
    );
  }
  const leftover = input.amountCents - applied;
  if (leftover > 0) {
    await tx.studentCredit.create({
      data: {
        tenantId: input.tenantId,
        studentId: invoice.studentId,
        amountCents: leftover,
        remainingCents: leftover,
        allocationGroupId: groupId,
        reason: "Paiement en ligne supérieur au reste dû",
      },
    });
  }
}

export async function listStudentCredits(studentId: string) {
  await requireStudentRecord(studentId);
  return prisma.studentCredit.findMany({ where: { studentId }, orderBy: { createdAt: "desc" } });
}

/** Détail d'un versement groupé (reçu détaillé). */
export async function getAllocationGroup(allocationGroupId: string) {
  const payments = await prisma.studentPayment.findMany({
    where: { allocationGroupId },
    include: { invoice: { include: { items: true } }, receipt: true },
    orderBy: { createdAt: "asc" },
  });
  if (payments.length === 0) throw new AppError(404, "PAYMENT_GROUP_NOT_FOUND", "Versement introuvable");
  const credit = await prisma.studentCredit.findFirst({ where: { allocationGroupId } });
  return { payments, creditCents: credit?.amountCents ?? 0 };
}
