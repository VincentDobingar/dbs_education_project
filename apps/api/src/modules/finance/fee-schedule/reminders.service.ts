import { logger } from "../../../lib/logger.js";
import { rawPrisma, withTenantSession } from "../../../lib/prisma.js";
import { getRedisClient } from "../../../lib/redis.js";
import { sendSms } from "../../../lib/sms-provider/send-sms.js";
import { runWithContext } from "../../../lib/tenant-context.js";
import { notifyParentsOfStudent } from "../../communication/notification.service.js";
import { getFeePolicy } from "../fee-setup.service.js";
import type { FeePolicy } from "../fee-setup.validation.js";

import { startOfUtcDay } from "./engine.js";

const DAY_MS = 86_400_000;
const OPEN = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] as const;

type ReminderKind = "BEFORE_DUE" | "AFTER_DUE" | "LONG_OVERDUE";

/** Quel rappel une échéance appelle aujourd'hui (null : aucun). */
export function reminderKindFor(dueAt: Date, now: Date, policy: FeePolicy): ReminderKind | null {
  const today = startOfUtcDay(now).getTime();
  const due = startOfUtcDay(dueAt).getTime();
  const days = Math.round((today - due) / DAY_MS); // > 0 : jours de retard
  if (days >= policy.longOverdueDays) return "LONG_OVERDUE";
  if (days >= policy.reminderDaysAfter && days > 0) return "AFTER_DUE";
  if (days <= 0 && -days <= policy.reminderDaysBefore) return "BEFORE_DUE";
  return null;
}

/** Montant d'une pénalité de retard (0 si désactivée ou non encore applicable). */
export function penaltyAmountFor(outstandingCents: number, daysLate: number, policy: FeePolicy): number {
  if (!policy.penaltyEnabled || policy.penaltyValue <= 0 || daysLate < policy.penaltyAfterDays) return 0;
  if (policy.penaltyKind === "PERCENT") return Math.floor((outstandingCents * policy.penaltyValue) / 10_000);
  return policy.penaltyValue;
}

function formatXaf(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 }).replace(/[\u00a0\u202f]/g, " ");
}

function messageFor(
  kind: ReminderKind,
  input: { student: string; school: string; amount: string; due: string },
): string {
  if (kind === "BEFORE_DUE") {
    return `${input.school} : l'échéance de ${input.amount} pour ${input.student} arrive le ${input.due}. Paiement possible à la caisse ou en ligne depuis le portail.`;
  }
  if (kind === "AFTER_DUE") {
    return `${input.school} : l'échéance de ${input.amount} pour ${input.student} était due le ${input.due}. Merci de régulariser à la caisse ou en ligne.`;
  }
  return `${input.school} : l'échéance de ${input.amount} pour ${input.student} (due le ${input.due}) reste impayée. Contactez l'économat pour convenir d'un arrangement.`;
}

/**
 * Un passage pour un établissement : rappels (J-3, J+1, J+15 par défaut, une seule
 * fois par échéance et par type) et pénalités de retard si la direction les a
 * activées (une seule par échéance).
 */
export async function runFeeCycleForTenant(
  tenantId: string,
  now = new Date(),
): Promise<{ reminders: number; penalties: number }> {
  const policy = await getFeePolicy(tenantId);
  if (!policy.remindersEnabled && !policy.penaltyEnabled) return { reminders: 0, penalties: 0 };
  const horizon = new Date(now.getTime() + (policy.reminderDaysBefore + 1) * DAY_MS);
  const [tenant, invoices] = await withTenantSession(tenantId, (tx) =>
    Promise.all([
      tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } }),
      tx.studentInvoice.findMany({
        where: { tenantId, deletedAt: null, status: { in: [...OPEN] }, dueAt: { not: null, lte: horizon } },
        include: { student: { include: { primaryGuardian: { select: { phone: true } } } } },
      }),
    ]),
  );
  let reminders = 0;
  let penalties = 0;
  for (const invoice of invoices) {
    const outstanding = invoice.totalCents - invoice.paidCents;
    if (outstanding <= 0 || !invoice.dueAt || invoice.student.deletedAt) continue;
    if (["WITHDRAWN", "TRANSFERRED", "ARCHIVED"].includes(invoice.student.status)) continue;
    const daysLate = Math.round(
      (startOfUtcDay(now).getTime() - startOfUtcDay(invoice.dueAt).getTime()) / DAY_MS,
    );

    const penalty = invoice.kind === "PENALTY" ? 0 : penaltyAmountFor(outstanding, daysLate, policy);
    if (penalty > 0) {
      const created = await withTenantSession(tenantId, async (tx) => {
        const exists = await tx.studentInvoice.findUnique({ where: { penaltyForInvoiceId: invoice.id } });
        if (exists) return false;
        await tx.studentInvoice.create({
          data: {
            tenantId,
            studentId: invoice.studentId,
            academicYearId: invoice.academicYearId,
            number: `PEN-${invoice.number}`,
            status: "ISSUED",
            kind: "PENALTY",
            agreementId: invoice.agreementId,
            penaltyForInvoiceId: invoice.id,
            totalCents: penalty,
            dueAt: startOfUtcDay(now),
            issuedAt: now,
            items: {
              create: { description: `Pénalité de retard — ${invoice.number}`, amountCents: penalty },
            },
          },
        });
        return true;
      });
      if (created) penalties++;
    }

    // La pénalité est annoncée par le rappel de l'échéance en retard : pas de rappel propre.
    if (!policy.remindersEnabled || invoice.kind === "PENALTY") continue;
    const kind = reminderKindFor(invoice.dueAt, now, policy);
    if (!kind) continue;
    const logged = await withTenantSession(tenantId, async (tx) => {
      const exists = await tx.feeReminderLog.findUnique({
        where: { invoiceId_kind: { invoiceId: invoice.id, kind } },
      });
      if (exists) return false;
      await tx.feeReminderLog.create({ data: { tenantId, invoiceId: invoice.id, kind } });
      return true;
    });
    if (!logged) continue;
    reminders++;
    const body = messageFor(kind, {
      student: `${invoice.student.firstName} ${invoice.student.lastName}`,
      school: tenant.name,
      amount: `${formatXaf(outstanding)} FCFA`,
      due: invoice.dueAt.toLocaleDateString("fr-FR", { timeZone: "UTC" }),
    });
    await runWithContext({ userId: null, tenantId }, () =>
      notifyParentsOfStudent({
        studentId: invoice.studentId,
        type: "FEE_REMINDER",
        title: kind === "BEFORE_DUE" ? "Échéance à venir" : "Échéance en retard",
        body,
        metadata: { invoiceId: invoice.id, kind },
      }),
    ).catch((err: unknown) =>
      logger.error({ err, invoiceId: invoice.id }, "Fee reminder notification failed"),
    );
    const phone = invoice.student.primaryGuardian?.phone;
    if (phone && /^\+?\d[\d\s]{6,}$/.test(phone)) sendSms({ to: phone.replace(/\s+/g, ""), body });
  }
  return { reminders, penalties };
}

/** Passage sur tous les établissements actifs. */
export async function runFeeCycle(now = new Date()): Promise<void> {
  const tenants = await rawPrisma.tenant.findMany({
    where: { status: { in: ["ACTIVE", "TRIAL", "VERIFIED"] } },
    select: { id: true },
  });
  for (const tenant of tenants) {
    try {
      const result = await runFeeCycleForTenant(tenant.id, now);
      if (result.reminders || result.penalties)
        logger.info({ tenantId: tenant.id, ...result }, "Fee cycle done");
    } catch (err) {
      logger.error({ err, tenantId: tenant.id }, "Fee cycle failed for tenant");
    }
  }
}

/**
 * Planificateur interne : un passage par heure, protégé par un verrou Redis pour
 * qu'une seule instance de l'API l'exécute. Désactivable (FEE_SCHEDULER_ENABLED=false).
 */
export function startFeeScheduler(): void {
  if (process.env.NODE_ENV === "test" || process.env.FEE_SCHEDULER_ENABLED === "false") return;
  const tick = async (): Promise<void> => {
    try {
      const lock = await getRedisClient().set("fee-cycle-lock", String(process.pid), "EX", 3300, "NX");
      if (lock !== "OK") return;
      await runFeeCycle();
    } catch (err) {
      logger.error({ err }, "Fee scheduler tick failed");
    }
  };
  setTimeout(() => void tick(), 60_000).unref();
  setInterval(() => void tick(), 3_600_000).unref();
}
