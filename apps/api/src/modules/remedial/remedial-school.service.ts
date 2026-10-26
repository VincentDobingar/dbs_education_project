import type { RemedialOffer, RemedialTariff } from "@prisma/client";

import { resolveActingEmployeeId } from "../../lib/acting-employee.js";
import { recordAuditLog } from "../../lib/audit-log.js";
import { getEffectivePermissionCodes } from "../../lib/authorization.js";
import { AppError } from "../../lib/errors.js";
import { prisma, rawPrisma, withTenantSession } from "../../lib/prisma.js";
import type { TenantActor } from "../../lib/tenant-actor.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";
import { recordManualCashPayment } from "../payments/payment.service.js";

import { getPlatformCommissionBps } from "./remedial-settlement.js";
import type { OfferInput, TariffInput } from "./remedial.validation.js";

/**
 * Côté établissement de l'ENSEIGNANT : grille tarifaire (validée par la
 * direction), offres des enseignants et leur validation, inscrits, encaissement
 * en espèces, reversements. Tables hors RLS (voir remedial.prisma) : chaque
 * requête est bornée explicitement par le tenant courant.
 */

// ---------------------------------------------------------------- Grille tarifaire

export async function listTariffs(): Promise<RemedialTariff[]> {
  return rawPrisma.remedialTariff.findMany({
    where: { tenantId: requireCurrentTenantId() },
    orderBy: [{ isActive: "desc" }, { label: "asc" }],
  });
}

async function assertSharesFit(schoolShareBps: number): Promise<number> {
  const platformBps = await getPlatformCommissionBps();
  if (schoolShareBps + platformBps > 10_000) {
    throw new AppError(
      422,
      "REMEDIAL_SHARES_TOO_HIGH",
      `School share plus platform commission (${platformBps / 100} %) exceeds 100 %`,
    );
  }
  return platformBps;
}

export async function createTariff(input: TariffInput, actor: TenantActor): Promise<RemedialTariff> {
  const tenantId = requireCurrentTenantId();
  await assertSharesFit(input.schoolShareBps);
  const tenant = await rawPrisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { currencyId: true },
  });
  const tariff = await rawPrisma.remedialTariff.create({
    data: { ...input, tenantId, currencyId: tenant.currencyId, approvedById: actor.actorUserId },
  });
  await recordAuditLog({
    tenantId,
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action: "remedial.tariff_create",
    entityType: "RemedialTariff",
    entityId: tariff.id,
    afterData: { ...input },
  });
  return tariff;
}

export async function updateTariff(
  id: string,
  input: TariffInput,
  actor: TenantActor,
): Promise<RemedialTariff> {
  const tenantId = requireCurrentTenantId();
  const before = await rawPrisma.remedialTariff.findFirst({ where: { id, tenantId } });
  if (!before) throw new AppError(404, "REMEDIAL_TARIFF_NOT_FOUND", "Tariff not found");
  await assertSharesFit(input.schoolShareBps);
  // Les offres déjà soumises gardent leur prix figé : seules les nouvelles soumissions changent.
  const tariff = await rawPrisma.remedialTariff.update({
    where: { id },
    data: { ...input, approvedById: actor.actorUserId },
  });
  await recordAuditLog({
    tenantId,
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action: "remedial.tariff_update",
    entityType: "RemedialTariff",
    entityId: id,
    beforeData: {
      hourlyRateCents: before.hourlyRateCents,
      schoolShareBps: before.schoolShareBps,
      isActive: before.isActive,
    },
    afterData: {
      hourlyRateCents: input.hourlyRateCents,
      schoolShareBps: input.schoolShareBps,
      isActive: input.isActive,
    },
  });
  return tariff;
}

// ---------------------------------------------------------------- Offres

async function requireTeacherEmployeeId(userId: string): Promise<string> {
  const employeeId = await resolveActingEmployeeId(userId);
  if (!employeeId) {
    throw new AppError(
      403,
      "EMPLOYEE_RECORD_REQUIRED",
      "Your account must be linked to an employee record to offer remedial courses",
    );
  }
  return employeeId;
}

async function enrollmentCounts(
  offerIds: string[],
): Promise<Map<string, { confirmed: number; pending: number }>> {
  const groups = await rawPrisma.remedialEnrollment.groupBy({
    by: ["offerId", "status"],
    where: { offerId: { in: offerIds }, status: { in: ["CONFIRMED", "COMPLETED", "PENDING_PAYMENT"] } },
    _count: { _all: true },
  });
  const counts = new Map<string, { confirmed: number; pending: number }>();
  for (const group of groups) {
    const entry = counts.get(group.offerId) ?? { confirmed: 0, pending: 0 };
    if (group.status === "PENDING_PAYMENT") entry.pending += group._count._all;
    else entry.confirmed += group._count._all;
    counts.set(group.offerId, entry);
  }
  return counts;
}

export async function listOffers(scope: "mine" | "school", userId: string) {
  const tenantId = requireCurrentTenantId();
  const where =
    scope === "mine" ? { tenantId, employeeId: await requireTeacherEmployeeId(userId) } : { tenantId };
  const offers = await rawPrisma.remedialOffer.findMany({
    where,
    include: { tariff: { select: { label: true } } },
    orderBy: [{ status: "asc" }, { startsOn: "desc" }],
  });
  const counts = await enrollmentCounts(offers.map((offer) => offer.id));
  const employees = await prisma.employee.findMany({
    where: { id: { in: [...new Set(offers.map((offer) => offer.employeeId))] } },
    select: { id: true, firstName: true, lastName: true },
  });
  const names = new Map(
    employees.map((employee) => [employee.id, `${employee.firstName} ${employee.lastName}`]),
  );
  return offers.map((offer) => ({
    ...offer,
    teacherName: names.get(offer.employeeId) ?? "",
    enrollments: counts.get(offer.id) ?? { confirmed: 0, pending: 0 },
  }));
}

async function requireOwnOffer(id: string, userId: string): Promise<RemedialOffer> {
  const tenantId = requireCurrentTenantId();
  const employeeId = await requireTeacherEmployeeId(userId);
  const offer = await rawPrisma.remedialOffer.findFirst({ where: { id, tenantId, employeeId } });
  if (!offer) throw new AppError(404, "REMEDIAL_OFFER_NOT_FOUND", "Offer not found");
  return offer;
}

async function requireUsableTariff(tariffId: string): Promise<RemedialTariff> {
  const tariff = await rawPrisma.remedialTariff.findFirst({
    where: { id: tariffId, tenantId: requireCurrentTenantId(), isActive: true },
  });
  if (!tariff) throw new AppError(422, "REMEDIAL_TARIFF_UNAVAILABLE", "This tariff is not available");
  return tariff;
}

async function offerData(input: OfferInput) {
  const tariff = await requireUsableTariff(input.tariffId);
  if (input.subjectId) {
    const subject = await prisma.subject.findFirst({ where: { id: input.subjectId } });
    if (!subject) throw new AppError(422, "SUBJECT_NOT_FOUND", "Unknown subject");
  }
  const platformShareBps = await assertSharesFit(tariff.schoolShareBps);
  return {
    tariffId: tariff.id,
    subjectId: input.subjectId ?? null,
    subjectLabel: input.subjectLabel,
    levelLabel: input.levelLabel,
    title: input.title,
    description: input.description,
    location: input.location || null,
    accessDetails: input.accessDetails || null,
    capacity: tariff.format === "INDIVIDUAL" ? 1 : input.capacity,
    totalMinutes: input.totalMinutes,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    scheduleNote: input.scheduleNote,
    mode: tariff.mode,
    format: tariff.format,
    // Prix PAR ÉLÈVE figé au tarif du jour : un changement de grille ne touche pas les inscrits.
    priceCents: Math.round((tariff.hourlyRateCents * input.totalMinutes) / 60),
    currencyId: tariff.currencyId,
    schoolShareBps: tariff.schoolShareBps,
    platformShareBps,
  };
}

export async function createOffer(input: OfferInput, userId: string): Promise<RemedialOffer> {
  const tenantId = requireCurrentTenantId();
  const employeeId = await requireTeacherEmployeeId(userId);
  return rawPrisma.remedialOffer.create({
    data: { ...(await offerData(input)), tenantId, employeeId, teacherUserId: userId, status: "DRAFT" },
  });
}

export async function updateOffer(id: string, input: OfferInput, userId: string): Promise<RemedialOffer> {
  const offer = await requireOwnOffer(id, userId);
  if (offer.status !== "DRAFT" && offer.status !== "REJECTED") {
    throw new AppError(409, "REMEDIAL_OFFER_LOCKED", "Only a draft or rejected offer can be edited");
  }
  return rawPrisma.remedialOffer.update({
    where: { id },
    data: { ...(await offerData(input)), status: "DRAFT", reviewNote: null },
  });
}

export async function submitOffer(id: string, userId: string): Promise<RemedialOffer> {
  const offer = await requireOwnOffer(id, userId);
  if (offer.status !== "DRAFT" && offer.status !== "REJECTED") {
    throw new AppError(409, "REMEDIAL_OFFER_LOCKED", "Only a draft or rejected offer can be submitted");
  }
  // Re-fige prix et parts au moment de la soumission (la grille a pu changer).
  const tariff = await requireUsableTariff(offer.tariffId);
  const platformShareBps = await assertSharesFit(tariff.schoolShareBps);
  return rawPrisma.remedialOffer.update({
    where: { id },
    data: {
      status: "PENDING_REVIEW",
      priceCents: Math.round((tariff.hourlyRateCents * offer.totalMinutes) / 60),
      schoolShareBps: tariff.schoolShareBps,
      platformShareBps,
      mode: tariff.mode,
      format: tariff.format,
    },
  });
}

export async function reviewOffer(
  id: string,
  decision: "APPROVE" | "REJECT",
  note: string | undefined,
  actor: TenantActor,
): Promise<RemedialOffer> {
  const tenantId = requireCurrentTenantId();
  const offer = await rawPrisma.remedialOffer.findFirst({ where: { id, tenantId } });
  if (!offer) throw new AppError(404, "REMEDIAL_OFFER_NOT_FOUND", "Offer not found");
  if (offer.status !== "PENDING_REVIEW") {
    throw new AppError(409, "REMEDIAL_OFFER_NOT_PENDING", "Only an offer awaiting review can be reviewed");
  }
  if (decision === "REJECT" && !note) {
    throw new AppError(422, "REVIEW_NOTE_REQUIRED", "A reason is required to reject an offer");
  }
  const updated = await rawPrisma.remedialOffer.update({
    where: { id },
    data: {
      status: decision === "APPROVE" ? "PUBLISHED" : "REJECTED",
      reviewNote: note ?? null,
      reviewedById: actor.actorUserId,
      reviewedAt: new Date(),
      ...(decision === "APPROVE" ? { publishedAt: new Date() } : {}),
    },
  });
  await recordAuditLog({
    tenantId,
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action: decision === "APPROVE" ? "remedial.offer_approve" : "remedial.offer_reject",
    entityType: "RemedialOffer",
    entityId: id,
    afterData: { status: updated.status, priceCents: updated.priceCents, note: note ?? null },
  });
  return updated;
}

export async function closeOffer(id: string, userId: string, canManage: boolean): Promise<RemedialOffer> {
  const tenantId = requireCurrentTenantId();
  const offer = canManage
    ? await rawPrisma.remedialOffer.findFirst({ where: { id, tenantId } })
    : await requireOwnOffer(id, userId);
  if (!offer) throw new AppError(404, "REMEDIAL_OFFER_NOT_FOUND", "Offer not found");
  if (offer.status === "CLOSED") return offer;
  return rawPrisma.remedialOffer.update({ where: { id }, data: { status: "CLOSED" } });
}

// ---------------------------------------------------------------- Inscrits

export async function listOfferEnrollments(id: string, userId: string, canManage: boolean) {
  const tenantId = requireCurrentTenantId();
  const offer = canManage
    ? await rawPrisma.remedialOffer.findFirst({ where: { id, tenantId } })
    : await requireOwnOffer(id, userId);
  if (!offer) throw new AppError(404, "REMEDIAL_OFFER_NOT_FOUND", "Offer not found");

  const enrollments = await rawPrisma.remedialEnrollment.findMany({
    where: { offerId: offer.id, status: { not: "CANCELLED" } },
    orderBy: { createdAt: "asc" },
  });
  return describeEnrollments(enrollments);
}

/**
 * Données minimales d'un élève d'un AUTRE établissement : nom, établissement,
 * et le contact de la personne qui l'a inscrit une fois le paiement confirmé —
 * rien d'autre de son dossier scolaire.
 */
async function describeEnrollments(
  enrollments: {
    id: string;
    studentId: string;
    learnerTenantId: string;
    enrolledByUserId: string;
    enrolledAs: string;
    status: string;
    reference: string;
    amountCents: number;
    createdAt: Date;
    confirmedAt: Date | null;
  }[],
) {
  const byTenant = new Map<string, string[]>();
  for (const enrollment of enrollments) {
    byTenant.set(enrollment.learnerTenantId, [
      ...(byTenant.get(enrollment.learnerTenantId) ?? []),
      enrollment.studentId,
    ]);
  }
  const students = new Map<string, { firstName: string; lastName: string }>();
  for (const [learnerTenantId, studentIds] of byTenant) {
    const rows = await withTenantSession(learnerTenantId, (tx) =>
      tx.student.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, firstName: true, lastName: true },
      }),
    );
    for (const row of rows) students.set(row.id, row);
  }
  const [tenants, payers] = await Promise.all([
    rawPrisma.tenant.findMany({
      where: { id: { in: [...byTenant.keys()] } },
      select: { id: true, name: true },
    }),
    rawPrisma.user.findMany({
      where: { id: { in: enrollments.map((enrollment) => enrollment.enrolledByUserId) } },
      select: { id: true, email: true },
    }),
  ]);
  const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
  const payerEmails = new Map(payers.map((payer) => [payer.id, payer.email]));

  return enrollments.map((enrollment) => ({
    id: enrollment.id,
    reference: enrollment.reference,
    status: enrollment.status,
    amountCents: enrollment.amountCents,
    createdAt: enrollment.createdAt,
    confirmedAt: enrollment.confirmedAt,
    enrolledAs: enrollment.enrolledAs,
    student: students.get(enrollment.studentId) ?? { firstName: "", lastName: "" },
    learnerSchool: tenantNames.get(enrollment.learnerTenantId) ?? "",
    contactEmail:
      enrollment.status === "PENDING_PAYMENT" ? null : (payerEmails.get(enrollment.enrolledByUserId) ?? null),
  }));
}

/** Encaissement en espèces par l'établissement de l'enseignant (même circuit que les reçus SaaS). */
export async function recordCashPayment(enrollmentId: string, actor: TenantActor) {
  const tenantId = requireCurrentTenantId();
  const enrollment = await rawPrisma.remedialEnrollment.findFirst({
    where: { id: enrollmentId, offerTenantId: tenantId },
  });
  if (!enrollment) throw new AppError(404, "REMEDIAL_ENROLLMENT_NOT_FOUND", "Enrollment not found");
  if (enrollment.status !== "PENDING_PAYMENT") {
    throw new AppError(409, "REMEDIAL_ENROLLMENT_NOT_PAYABLE", "This enrollment is not awaiting payment");
  }

  const cashProvider = await rawPrisma.paymentProvider.findFirst({
    where: { methodType: "CASH", isActive: true },
  });
  if (!cashProvider) throw new AppError(503, "CASH_PROVIDER_MISSING", "No active cash provider");

  const idempotencyKey = `RC-CASH-${enrollment.reference}`;
  const intent =
    (await rawPrisma.paymentIntent.findUnique({ where: { idempotencyKey } })) ??
    (await rawPrisma.paymentIntent.create({
      data: {
        providerId: cashProvider.id,
        purpose: "REMEDIAL_COURSE",
        remedialEnrollmentId: enrollment.id,
        amountCents: enrollment.amountCents,
        currencyId: enrollment.currencyId,
        idempotencyKey,
      },
    }));
  const transaction = await recordManualCashPayment({ paymentIntentId: intent.id });

  await recordAuditLog({
    tenantId,
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action: "remedial.cash_payment",
    entityType: "RemedialEnrollment",
    entityId: enrollment.id,
    afterData: { amountCents: enrollment.amountCents, transactionId: transaction.id },
  });
  return { enrollmentId: enrollment.id, transactionId: transaction.id };
}

// ---------------------------------------------------------------- Reversements

export async function listPayouts(userId: string, canManage: boolean) {
  const tenantId = requireCurrentTenantId();
  const where = canManage
    ? { tenantId, beneficiary: { in: ["TEACHER", "SCHOOL"] as ("TEACHER" | "SCHOOL")[] } }
    : { tenantId, beneficiary: "TEACHER" as const, employeeId: await requireTeacherEmployeeId(userId) };
  const lines = await rawPrisma.remedialPayoutLine.findMany({
    where,
    include: { enrollment: { select: { reference: true, offer: { select: { title: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return lines.map((line) => ({
    id: line.id,
    beneficiary: line.beneficiary,
    employeeId: line.employeeId,
    amountCents: line.amountCents,
    status: line.status,
    paidAt: line.paidAt,
    paidReference: line.paidReference,
    createdAt: line.createdAt,
    reference: line.enrollment.reference,
    offerTitle: line.enrollment.offer.title,
  }));
}

/** Ce dont l'écran a besoin : devise de l'établissement, commission DBSA, droits de l'utilisateur. */
export async function getContext(userId: string) {
  const tenantId = requireCurrentTenantId();
  const [tenant, platformShareBps, permissions] = await Promise.all([
    rawPrisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { currency: { select: { isoCode: true, symbol: true, decimalDigits: true } } },
    }),
    getPlatformCommissionBps(),
    getEffectivePermissionCodes(userId, tenantId),
  ]);
  const employeeId = await resolveActingEmployeeId(userId);
  return {
    currency: tenant.currency,
    platformShareBps,
    canManage: permissions.has("remedial.manage"),
    canTeach: permissions.has("remedial.teach") && Boolean(employeeId),
    hasEmployeeRecord: Boolean(employeeId),
  };
}
