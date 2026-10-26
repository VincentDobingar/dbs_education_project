import type { RemedialPayoutBeneficiary } from "@prisma/client";

import { sendEmail } from "../../lib/email-provider/send-email.js";
import { rawPrisma, type PrismaTransactionClient } from "../../lib/prisma.js";

/** Commission DBSA par défaut : 10 % (paramètre plateforme remedial.platformCommissionBps). */
export const DEFAULT_PLATFORM_COMMISSION_BPS = 1000;
export const PLATFORM_COMMISSION_SETTING_KEY = "remedial.platformCommissionBps";

export async function getPlatformCommissionBps(): Promise<number> {
  const setting = await rawPrisma.platformSetting.findUnique({
    where: { key: PLATFORM_COMMISSION_SETTING_KEY },
  });
  const value = typeof setting?.value === "number" ? setting.value : Number(setting?.value);
  return Number.isInteger(value) && value >= 0 && value <= 5000 ? value : DEFAULT_PLATFORM_COMMISSION_BPS;
}

/** Répartition d'un montant : la part de l'enseignant absorbe les arrondis. */
export function splitAmount(
  amountCents: number,
  schoolShareBps: number,
  platformShareBps: number,
): Record<RemedialPayoutBeneficiary, number> {
  const platform = Math.floor((amountCents * platformShareBps) / 10_000);
  const school = Math.floor((amountCents * schoolShareBps) / 10_000);
  return { PLATFORM: platform, SCHOOL: school, TEACHER: amountCents - platform - school };
}

/**
 * Appelée dans la transaction du paiement réussi (payment.service.ts, espèces ou
 * webhook opérateur) : confirme l'inscription et crée les lignes de reversement.
 * Idempotente — un second webhook ne change rien.
 */
export async function confirmRemedialEnrollment(
  tx: PrismaTransactionClient,
  enrollmentId: string,
): Promise<void> {
  const enrollment = await tx.remedialEnrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    include: { offer: true, payoutLines: { select: { id: true } } },
  });
  if (enrollment.status === "CONFIRMED" || enrollment.status === "COMPLETED") {
    return;
  }

  await tx.remedialEnrollment.update({
    where: { id: enrollment.id },
    data: { status: "CONFIRMED", confirmedAt: new Date(), cancelledAt: null, cancelReason: null },
  });

  if (enrollment.payoutLines.length === 0) {
    const shares = splitAmount(
      enrollment.amountCents,
      enrollment.offer.schoolShareBps,
      enrollment.offer.platformShareBps,
    );
    await tx.remedialPayoutLine.createMany({
      data: [
        {
          enrollmentId: enrollment.id,
          beneficiary: "TEACHER",
          tenantId: enrollment.offerTenantId,
          employeeId: enrollment.offer.employeeId,
          amountCents: shares.TEACHER,
          currencyId: enrollment.currencyId,
        },
        {
          enrollmentId: enrollment.id,
          beneficiary: "SCHOOL",
          tenantId: enrollment.offerTenantId,
          amountCents: shares.SCHOOL,
          currencyId: enrollment.currencyId,
        },
        {
          enrollmentId: enrollment.id,
          beneficiary: "PLATFORM",
          amountCents: shares.PLATFORM,
          currencyId: enrollment.currencyId,
        },
      ],
    });
  }

  // Envois non bloquants : le paiement est acquis quoi qu'il arrive aux e-mails.
  const [payer, teacher] = await Promise.all([
    tx.user.findUnique({ where: { id: enrollment.enrolledByUserId }, select: { email: true } }),
    tx.user.findUnique({ where: { id: enrollment.offer.teacherUserId }, select: { email: true } }),
  ]);
  const title = enrollment.offer.title;
  if (payer) {
    sendEmail({
      to: payer.email,
      subject: `Inscription confirmée : ${title}`,
      text: `Bonjour,\n\nLe paiement est reçu et l'inscription au cours de renforcement « ${title} » est confirmée (référence ${enrollment.reference}).\nLes informations pratiques du cours sont disponibles dans le portail famille, rubrique « Cours de renforcement ».\n\nL'équipe EduManage Africa`,
    });
  }
  if (teacher) {
    sendEmail({
      to: teacher.email,
      subject: `Nouvel inscrit : ${title}`,
      text: `Bonjour,\n\nUn nouvel élève est inscrit et a réglé votre cours de renforcement « ${title} » (référence ${enrollment.reference}).\nLa liste des inscrits est dans votre espace, rubrique « Cours de renforcement ».\n\nL'équipe EduManage Africa`,
    });
  }
}
