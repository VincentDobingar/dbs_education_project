import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * L'élève n'apparaît dans sa classe qu'une fois les frais d'inscription payés :
 * dès que l'échéance « inscription » d'un contrat est soldée, l'inscription admise
 * (ADMITTED) devient effective (ENROLLED, ou RE_ENROLLED pour un ancien élève) et
 * le dossier prospect devient actif. À appeler dans la transaction qui solde la
 * facture ; sans effet pour toute autre échéance. Idempotent.
 */
export async function activateEnrollmentIfRegistrationPaid(tx: Tx, invoiceId: string): Promise<boolean> {
  const invoice = await tx.studentInvoice.findUnique({
    where: { id: invoiceId },
    // tenantId sélectionné : le garde multi-établissement du client étendu l'exige.
    select: { tenantId: true, kind: true, status: true, agreementId: true },
  });
  if (!invoice || invoice.kind !== "REGISTRATION" || invoice.status !== "PAID" || !invoice.agreementId) {
    return false;
  }
  const agreement = await tx.studentFeeAgreement.findUnique({
    where: { id: invoice.agreementId },
    include: { enrollment: true },
  });
  if (!agreement || agreement.enrollment.status !== "ADMITTED" || agreement.enrollment.deletedAt)
    return false;
  await tx.enrollment.update({
    where: { id: agreement.enrollmentId },
    data: { status: agreement.isReturning ? "RE_ENROLLED" : "ENROLLED", enrolledAt: new Date() },
  });
  await tx.student.updateMany({
    where: { id: agreement.studentId, status: "PROSPECTIVE" },
    data: { status: "ACTIVE" },
  });
  return true;
}
