import { randomBytes } from "node:crypto";

import { AppError } from "../../../lib/errors.js";
import { logger } from "../../../lib/logger.js";
import { prisma, rawPrisma } from "../../../lib/prisma.js";
import { requireCurrentTenantId } from "../../../lib/tenant-context.js";
import {
  getPaymentProviderAdapter,
  listInitiatingProviderCodes,
} from "../../payments/payment-providers/registry.js";
import { getFeePolicy } from "../fee-setup.service.js";

import { reportCardWithholding } from "./withholding.js";

const OPEN = new Set(["ISSUED", "PARTIALLY_PAID", "OVERDUE"]);

/** Centièmes d'unité (convention des frais scolaires) → unités mineures de la devise. */
export function studentCentsToMinorUnits(cents: number, decimalDigits: number): number {
  return Math.round((cents * 10 ** decimalDigits) / 100);
}

/** Unités mineures de la devise → centièmes d'unité (convention des frais scolaires). */
export function minorUnitsToStudentCents(minor: number, decimalDigits: number): number {
  return Math.round((minor * 100) / 10 ** decimalDigits);
}

function dueLabel(invoice: {
  kind: string;
  installmentSequence: number | null;
  items: { description: string }[];
  number: string;
}): string {
  if (invoice.kind === "REGISTRATION") return "Frais d'inscription";
  if (invoice.kind === "PENALTY") return "Pénalité de retard";
  if (invoice.kind === "INSTALLMENT" && invoice.installmentSequence)
    return `Tranche ${invoice.installmentSequence}`;
  return invoice.items[0]?.description ?? invoice.number;
}

/**
 * Échéancier tel que le voit la famille : « vous devez X avant le JJ/MM (tranche n) »,
 * les échéances passées et à venir, l'avoir éventuel et la retenue du bulletin.
 */
export async function getFamilySchedule(studentId: string) {
  const tenantId = requireCurrentTenantId();
  const [invoices, credits, policy, withholding, tenant] = await Promise.all([
    prisma.studentInvoice.findMany({
      where: { studentId, deletedAt: null, status: { notIn: ["DRAFT", "CANCELLED"] } },
      include: { items: true },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    }),
    prisma.studentCredit.findMany({ where: { studentId, remainingCents: { gt: 0 } } }),
    getFeePolicy(tenantId),
    reportCardWithholding(studentId),
    rawPrisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true, currency: { select: { isoCode: true } } },
    }),
  ]);
  const now = new Date();
  const dues = invoices.map((invoice) => {
    const outstandingCents = Math.max(invoice.totalCents - invoice.paidCents, 0);
    return {
      id: invoice.id,
      number: invoice.number,
      label: dueLabel(invoice),
      kind: invoice.kind,
      dueAt: invoice.dueAt,
      totalCents: invoice.totalCents,
      paidCents: invoice.paidCents,
      outstandingCents,
      status: invoice.status,
      isOverdue:
        OPEN.has(invoice.status) && outstandingCents > 0 && invoice.dueAt !== null && invoice.dueAt < now,
      items: invoice.items.map((item) => ({
        description: item.description,
        amountCents: item.amountCents - item.discountCents,
      })),
    };
  });
  const open = dues.filter((due) => OPEN.has(due.status) && due.outstandingCents > 0);
  const next = open.find((due) => due.isOverdue) ?? open[0] ?? null;
  return {
    schoolName: tenant.name,
    currency: tenant.currency.isoCode,
    dues,
    outstandingCents: open.reduce((sum, due) => sum + due.outstandingCents, 0),
    overdueCents: open.filter((due) => due.isOverdue).reduce((sum, due) => sum + due.outstandingCents, 0),
    creditCents: credits.reduce((sum, credit) => sum + credit.remainingCents, 0),
    nextDue: next
      ? { id: next.id, label: next.label, dueAt: next.dueAt, amountCents: next.outstandingCents }
      : null,
    reportCardWithheld: withholding.withheld,
    onlinePaymentEnabled: policy.onlinePaymentEnabled,
  };
}

async function requireOpenInvoice(studentId: string, invoiceId: string) {
  const invoice = await prisma.studentInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.studentId !== studentId || invoice.deletedAt) {
    throw new AppError(404, "INVOICE_NOT_FOUND", "Échéance introuvable");
  }
  if (!OPEN.has(invoice.status) || invoice.totalCents - invoice.paidCents <= 0) {
    throw new AppError(409, "INVOICE_NOT_PAYABLE", "Cette échéance est déjà réglée");
  }
  return invoice;
}

export async function listFamilyPaymentOptions(studentId: string, invoiceId: string) {
  const invoice = await requireOpenInvoice(studentId, invoiceId);
  const tenantId = requireCurrentTenantId();
  const policy = await getFeePolicy(tenantId);
  const tenant = await rawPrisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { countryId: true, name: true },
  });
  const providers = policy.onlinePaymentEnabled
    ? await rawPrisma.paymentProvider.findMany({
        where: { isActive: true, code: { in: listInitiatingProviderCodes() }, countryId: tenant.countryId },
        select: { code: true, nameFr: true, nameEn: true, isTestMode: true },
        orderBy: { nameFr: "asc" },
      })
    : [];
  return {
    providers,
    amountCents: invoice.totalCents - invoice.paidCents,
    cash: { schoolName: tenant.name, reference: invoice.number },
  };
}

/** Paiement en ligne d'une échéance : montant = reste dû ; confirmé par le webhook de l'opérateur. */
export async function payInvoiceOnline(
  studentId: string,
  invoiceId: string,
  providerCode: string,
  phone: string,
) {
  const invoice = await requireOpenInvoice(studentId, invoiceId);
  const options = await listFamilyPaymentOptions(studentId, invoiceId);
  const adapter = getPaymentProviderAdapter(providerCode);
  if (!options.providers.some((provider) => provider.code === providerCode) || !adapter?.initiatePayment) {
    throw new AppError(
      422,
      "PAYMENT_PROVIDER_UNAVAILABLE",
      "Ce moyen de paiement n'est pas disponible pour cet établissement",
    );
  }
  const tenantId = requireCurrentTenantId();
  const [provider, tenant] = await Promise.all([
    rawPrisma.paymentProvider.findUniqueOrThrow({ where: { code: providerCode } }),
    rawPrisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: { currency: true } }),
  ]);
  // Les frais scolaires sont tenus en centièmes de l'unité (FCFA × 100) ; une
  // intention de paiement est en unités mineures de la devise (XAF : 0 décimale).
  const minorUnits = studentCentsToMinorUnits(options.amountCents, tenant.currency.decimalDigits);
  if (minorUnits <= 0)
    throw new AppError(400, "AMOUNT_TOO_SMALL", "Montant trop faible pour un paiement en ligne");
  const intent = await rawPrisma.paymentIntent.create({
    data: {
      providerId: provider.id,
      purpose: "STUDENT_FEE",
      studentInvoiceId: invoice.id,
      tenantId,
      amountCents: minorUnits,
      currencyId: tenant.currencyId,
      idempotencyKey: `SF-${invoice.number}-${randomBytes(3).toString("hex").toUpperCase()}`,
    },
  });
  try {
    const result = await adapter.initiatePayment({
      merchantReference: intent.idempotencyKey,
      amountCents: intent.amountCents,
      currencyIsoCode: tenant.currency.isoCode,
      currencyDecimalDigits: tenant.currency.decimalDigits,
      customerPhone: phone,
      description: `${tenant.name} — échéance ${invoice.number}`,
    });
    return {
      paymentIntentId: intent.id,
      status: "PENDING" as const,
      customerMessage: result.customerMessage,
    };
  } catch (error) {
    logger.error({ err: error, providerCode, invoiceId }, "Student fee payment initiation failed");
    await rawPrisma.paymentIntent.update({ where: { id: intent.id }, data: { status: "FAILED" } });
    throw new AppError(
      502,
      "PAYMENT_INITIATION_FAILED",
      "L'opérateur de paiement n'a pas accepté la demande",
    );
  }
}

export async function getFamilyPaymentStatus(studentId: string, invoiceId: string, paymentIntentId: string) {
  const invoice = await prisma.studentInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.studentId !== studentId)
    throw new AppError(404, "INVOICE_NOT_FOUND", "Échéance introuvable");
  const intent = await rawPrisma.paymentIntent.findFirst({
    where: { id: paymentIntentId, studentInvoiceId: invoiceId },
    select: { status: true },
  });
  if (!intent) throw new AppError(404, "PAYMENT_INTENT_NOT_FOUND", "Paiement introuvable");
  return { paymentStatus: intent.status, invoiceStatus: invoice.status };
}
