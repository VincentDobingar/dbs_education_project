import { recordAuditLog } from "../../../lib/audit-log.js";
import { AppError } from "../../../lib/errors.js";
import { rawPrisma, withTenantSession } from "../../../lib/prisma.js";

/**
 * Frais scolaires payés en ligne : encaissés par DBSA sur son compte marchand
 * (Konoom…), puis reversés à chaque établissement. Liste des montants à reverser.
 */
export async function listFeeSettlements() {
  const intents = await rawPrisma.paymentIntent.findMany({
    where: { purpose: "STUDENT_FEE", status: "SUCCEEDED", tenantId: { not: null } },
    select: { tenantId: true },
    distinct: ["tenantId"],
  });
  const rows = [];
  for (const { tenantId } of intents) {
    if (!tenantId) continue;
    const [tenant, pending, settled] = await withTenantSession(tenantId, (tx) =>
      Promise.all([
        tx.tenant.findUniqueOrThrow({
          where: { id: tenantId },
          select: { name: true, currency: { select: { isoCode: true } } },
        }),
        tx.studentPayment.aggregate({
          where: { tenantId, paymentTransactionId: { not: null }, platformSettledAt: null },
          _sum: { amountCents: true },
          _count: true,
        }),
        tx.studentPayment.aggregate({
          where: { tenantId, paymentTransactionId: { not: null }, platformSettledAt: { not: null } },
          _sum: { amountCents: true },
        }),
      ]),
    );
    rows.push({
      tenantId,
      tenantName: tenant.name,
      currency: tenant.currency.isoCode,
      pendingCents: pending._sum.amountCents ?? 0,
      pendingPayments: pending._count,
      settledCents: settled._sum.amountCents ?? 0,
    });
  }
  return rows.sort((a, b) => b.pendingCents - a.pendingCents);
}

export async function markFeeSettlementPaid(
  tenantId: string,
  reference: string,
  actor: { actorUserId: string; actorRoleCode?: string; justification: string },
) {
  const result = await withTenantSession(tenantId, async (tx) => {
    const pending = await tx.studentPayment.findMany({
      where: { tenantId, paymentTransactionId: { not: null }, platformSettledAt: null },
      select: { id: true, amountCents: true },
    });
    if (pending.length === 0) throw new AppError(409, "NOTHING_TO_SETTLE", "Aucun montant à reverser");
    await tx.studentPayment.updateMany({
      where: { id: { in: pending.map((payment) => payment.id) } },
      data: { platformSettledAt: new Date() },
    });
    return {
      count: pending.length,
      amountCents: pending.reduce((sum, payment) => sum + payment.amountCents, 0),
    };
  });
  await recordAuditLog({
    tenantId,
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action: "student_fee.settlement_paid",
    entityType: "Tenant",
    entityId: tenantId,
    afterData: { reference, ...result },
    justification: actor.justification,
  });
  return result;
}
