import type { StudentInvoice } from "@prisma/client";
import { z } from "zod";

import { recordAuditLog } from "../../../lib/audit-log.js";
import { AppError } from "../../../lib/errors.js";
import { prisma, withTenantSession } from "../../../lib/prisma.js";
import type { TenantActor } from "../../../lib/tenant-actor.js";
import { requireCurrentTenantId } from "../../../lib/tenant-context.js";
import { requireStudentInvoice } from "../student-invoice.service.js";

export const rescheduleSchema = z.object({
  dueAt: z.coerce.date(),
  reason: z.string().trim().min(3).max(300),
});

export const splitSchema = z.object({
  parts: z
    .array(z.object({ amountCents: z.number().int().positive(), dueAt: z.coerce.date() }))
    .min(2)
    .max(12),
  reason: z.string().trim().min(3).max(300),
});

const OPEN = new Set(["ISSUED", "PARTIALLY_PAID", "OVERDUE"]);

/**
 * Échéancier individuel : report d'une échéance pour une famille en difficulté.
 * Le montant dû ne change pas ; l'action est tracée (qui, quand, pourquoi).
 */
export async function rescheduleInvoice(
  invoiceId: string,
  input: z.infer<typeof rescheduleSchema>,
  actor: TenantActor,
): Promise<StudentInvoice> {
  const invoice = await requireStudentInvoice(invoiceId);
  if (!OPEN.has(invoice.status)) {
    throw new AppError(409, "INVOICE_NOT_OPEN", "Seule une échéance non soldée peut être reportée");
  }
  const updated = await prisma.studentInvoice.update({
    where: { id: invoiceId },
    data: {
      dueAt: input.dueAt,
      ...(invoice.status === "OVERDUE"
        ? { status: invoice.paidCents > 0 ? "PARTIALLY_PAID" : "ISSUED" }
        : {}),
    },
  });
  await recordAuditLog({
    tenantId: invoice.tenantId,
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action: "student_invoice.reschedule",
    entityType: "StudentInvoice",
    entityId: invoiceId,
    beforeData: { dueAt: invoice.dueAt?.toISOString() ?? null },
    afterData: { dueAt: input.dueAt.toISOString() },
    justification: input.reason,
  });
  return updated;
}

/**
 * Découpage d'une échéance non entamée en plusieurs paiements datés : l'échéance
 * d'origine est annulée et remplacée ; la somme des parts doit être égale au
 * montant dû, pour que le total de la famille ne change pas.
 */
export async function splitInvoice(
  invoiceId: string,
  input: z.infer<typeof splitSchema>,
  actor: TenantActor,
): Promise<StudentInvoice[]> {
  const invoice = await requireStudentInvoice(invoiceId);
  if (!OPEN.has(invoice.status) || invoice.paidCents > 0) {
    throw new AppError(409, "INVOICE_NOT_SPLITTABLE", "Seule une échéance non entamée peut être découpée");
  }
  const total = input.parts.reduce((sum, part) => sum + part.amountCents, 0);
  if (total !== invoice.totalCents) {
    throw new AppError(
      400,
      "SPLIT_TOTAL_MISMATCH",
      "La somme des parts doit être égale au montant de l'échéance",
    );
  }
  const tenantId = requireCurrentTenantId();
  const label = invoice.items[0]?.description ?? invoice.number;
  const created = await withTenantSession(tenantId, async (tx) => {
    await tx.studentInvoice.update({ where: { id: invoiceId }, data: { status: "CANCELLED" } });
    const rows: StudentInvoice[] = [];
    for (const [index, part] of input.parts.entries()) {
      rows.push(
        await tx.studentInvoice.create({
          data: {
            tenantId,
            studentId: invoice.studentId,
            academicYearId: invoice.academicYearId,
            number: `${invoice.number}-${index + 1}`,
            status: "ISSUED",
            kind: invoice.kind,
            agreementId: invoice.agreementId,
            installmentSequence: invoice.installmentSequence,
            totalCents: part.amountCents,
            dueAt: part.dueAt,
            issuedAt: new Date(),
            items: {
              create: {
                description: `${label} (paiement ${index + 1}/${input.parts.length})`,
                amountCents: part.amountCents,
              },
            },
          },
        }),
      );
    }
    return rows;
  });
  await recordAuditLog({
    tenantId,
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action: "student_invoice.split",
    entityType: "StudentInvoice",
    entityId: invoiceId,
    beforeData: { totalCents: invoice.totalCents, dueAt: invoice.dueAt?.toISOString() ?? null },
    afterData: {
      parts: input.parts.map((part) => ({ amountCents: part.amountCents, dueAt: part.dueAt.toISOString() })),
    },
    justification: input.reason,
  });
  return created;
}

/** Échéancier d'un élève, regroupé par année, avec contrat et avoirs. */
export async function getStudentSchedule(studentId: string) {
  const [agreements, invoices, credits] = await Promise.all([
    prisma.studentFeeAgreement.findMany({
      where: { studentId },
      include: {
        discounts: true,
        feePlan: { select: { name: true } },
        enrollment: { select: { status: true, classroomId: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.studentInvoice.findMany({
      where: { studentId, deletedAt: null },
      include: { items: true },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    }),
    prisma.studentCredit.findMany({ where: { studentId, remainingCents: { gt: 0 } } }),
  ]);
  const now = new Date();
  const open = invoices.filter((invoice) => OPEN.has(invoice.status));
  const outstandingCents = open.reduce((sum, invoice) => sum + invoice.totalCents - invoice.paidCents, 0);
  const overdue = open.filter((invoice) => invoice.dueAt && invoice.dueAt < now);
  const next = open.find((invoice) => !invoice.dueAt || invoice.dueAt >= now) ?? null;
  return {
    agreements,
    invoices,
    creditCents: credits.reduce((sum, credit) => sum + credit.remainingCents, 0),
    outstandingCents,
    overdueCents: overdue.reduce((sum, invoice) => sum + invoice.totalCents - invoice.paidCents, 0),
    nextDue: next
      ? { invoiceId: next.id, dueAt: next.dueAt, amountCents: next.totalCents - next.paidCents }
      : null,
  };
}
