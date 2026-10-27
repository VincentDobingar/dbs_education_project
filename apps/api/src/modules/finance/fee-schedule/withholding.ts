import { AppError } from "../../../lib/errors.js";
import { prisma } from "../../../lib/prisma.js";
import { requireCurrentTenantId } from "../../../lib/tenant-context.js";
import { getFeePolicy } from "../fee-setup.service.js";

const DAY_MS = 86_400_000;

/**
 * Retenue du bulletin pour impayé, si la direction l'a activée : une échéance en
 * retard depuis plus de `withholdAfterDays` jours retient l'accès au bulletin dans
 * les portails parent et élève. L'établissement garde l'accès à ses bulletins.
 */
export async function reportCardWithholding(
  studentId: string,
): Promise<{ withheld: boolean; overdueCents: number }> {
  const policy = await getFeePolicy(requireCurrentTenantId());
  if (!policy.withholdReportCards) return { withheld: false, overdueCents: 0 };
  const limit = new Date(Date.now() - policy.withholdAfterDays * DAY_MS);
  const late = await prisma.studentInvoice.findMany({
    where: {
      studentId,
      deletedAt: null,
      status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
      dueAt: { lt: limit },
    },
    select: { totalCents: true, paidCents: true },
  });
  const overdueCents = late.reduce(
    (sum, invoice) => sum + Math.max(invoice.totalCents - invoice.paidCents, 0),
    0,
  );
  return { withheld: overdueCents > 0, overdueCents };
}

export async function assertReportCardNotWithheld(studentId: string): Promise<void> {
  const { withheld } = await reportCardWithholding(studentId);
  if (withheld) {
    throw new AppError(
      403,
      "REPORT_CARD_WITHHELD",
      "Le bulletin est retenu par l'établissement en raison d'une échéance impayée. Régularisez la situation pour y accéder.",
    );
  }
}
