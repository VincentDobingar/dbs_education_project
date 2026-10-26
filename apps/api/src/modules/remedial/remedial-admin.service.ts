import type { RemedialPayoutStatus } from "@prisma/client";

import { recordAuditLog } from "../../lib/audit-log.js";
import { AppError } from "../../lib/errors.js";
import { rawPrisma } from "../../lib/prisma.js";
import type { PlatformActor } from "../platform-admin/platform-actor.js";

/** Super-administration : reversements à effectuer (enseignants, établissements) et commission DBSA. */
export async function listPayouts(status: RemedialPayoutStatus | undefined) {
  const lines = await rawPrisma.remedialPayoutLine.findMany({
    where: status ? { status } : {},
    include: {
      enrollment: { select: { reference: true, offer: { select: { title: true, tenantId: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const tenants = await rawPrisma.tenant.findMany({
    where: { id: { in: [...new Set(lines.map((line) => line.enrollment.offer.tenantId))] } },
    select: { id: true, name: true },
  });
  const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
  const currencies = await rawPrisma.currency.findMany({
    where: { id: { in: [...new Set(lines.map((line) => line.currencyId))] } },
    select: { id: true, isoCode: true, symbol: true, decimalDigits: true },
  });
  const currencyById = new Map(currencies.map((currency) => [currency.id, currency]));
  return lines.map((line) => ({
    id: line.id,
    beneficiary: line.beneficiary,
    schoolName: tenantNames.get(line.enrollment.offer.tenantId) ?? "",
    employeeId: line.employeeId,
    amountCents: line.amountCents,
    currency: currencyById.get(line.currencyId) ?? null,
    status: line.status,
    paidAt: line.paidAt,
    paidReference: line.paidReference,
    reference: line.enrollment.reference,
    offerTitle: line.enrollment.offer.title,
    createdAt: line.createdAt,
  }));
}

export async function markPayoutPaid(id: string, reference: string, actor: PlatformActor) {
  const line = await rawPrisma.remedialPayoutLine.findUnique({ where: { id } });
  if (!line) throw new AppError(404, "PAYOUT_NOT_FOUND", "Payout line not found");
  if (line.status !== "PENDING") throw new AppError(409, "PAYOUT_NOT_PENDING", "Payout already settled");
  const updated = await rawPrisma.remedialPayoutLine.update({
    where: { id },
    data: { status: "PAID", paidAt: new Date(), paidReference: reference, paidById: actor.actorUserId },
  });
  await recordAuditLog({
    ...(line.tenantId ? { tenantId: line.tenantId } : {}),
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action: "remedial.payout_paid",
    entityType: "RemedialPayoutLine",
    entityId: id,
    afterData: { reference, amountCents: line.amountCents, beneficiary: line.beneficiary },
    justification: actor.justification,
  });
  return updated;
}
