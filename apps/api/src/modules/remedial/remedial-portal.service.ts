import { randomBytes } from "node:crypto";

import { Prisma, type RemedialMode } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { rawPrisma, withTenantSession } from "../../lib/prisma.js";
import { isStudentUnavailable } from "../../lib/student-status.js";
import { isTenantBlocked } from "../../lib/tenant-status.js";
import {
  getPaymentProviderAdapter,
  listInitiatingProviderCodes,
} from "../payments/payment-providers/registry.js";

/**
 * Côté FAMILLE (portail parent/élève) et catalogue public : n'importe quel élève
 * de la plateforme peut s'inscrire à l'offre publiée d'un enseignant d'un autre
 * établissement. Autorisation : relation parent VÉRIFIÉE ou lien élève — jamais
 * une simple déclaration.
 */

const SHOWCASE_TENANT_STATUSES = ["VERIFIED", "TRIAL", "ACTIVE"] as const;

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const currencySelect = { isoCode: true, symbol: true, decimalDigits: true } as const;

// ---------------------------------------------------------------- Catalogue

export async function listCatalog(query: {
  country?: string | undefined;
  mode?: RemedialMode | undefined;
  q?: string | undefined;
}) {
  const tenants = await rawPrisma.tenant.findMany({
    where: {
      status: { in: [...SHOWCASE_TENANT_STATUSES] },
      deletedAt: null,
      ...(query.country ? { country: { isoCode: query.country } } : {}),
    },
    select: {
      id: true,
      name: true,
      city: true,
      country: { select: { isoCode: true, nameFr: true, nameEn: true } },
    },
  });
  if (tenants.length === 0) return [];
  const tenantsById = new Map(tenants.map((tenant) => [tenant.id, tenant]));

  const offers = await rawPrisma.remedialOffer.findMany({
    where: {
      status: "PUBLISHED",
      endsOn: { gte: startOfToday() },
      tenantId: { in: [...tenantsById.keys()] },
      ...(query.mode ? { mode: query.mode } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: "insensitive" } },
              { subjectLabel: { contains: query.q, mode: "insensitive" } },
              { levelLabel: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { startsOn: "asc" },
    take: 200,
  });
  if (offers.length === 0) return [];

  const [taken, currencies, teachers] = await Promise.all([
    rawPrisma.remedialEnrollment.groupBy({
      by: ["offerId"],
      where: { offerId: { in: offers.map((offer) => offer.id) }, status: { not: "CANCELLED" } },
      _count: { _all: true },
    }),
    rawPrisma.currency.findMany({
      where: { id: { in: [...new Set(offers.map((offer) => offer.currencyId))] } },
      select: { id: true, ...currencySelect },
    }),
    teacherNames(offers.map((offer) => ({ tenantId: offer.tenantId, employeeId: offer.employeeId }))),
  ]);
  const takenByOffer = new Map(taken.map((row) => [row.offerId, row._count._all]));
  const currencyById = new Map(currencies.map((currency) => [currency.id, currency]));

  return offers.map((offer) => {
    const tenant = tenantsById.get(offer.tenantId)!;
    return {
      id: offer.id,
      title: offer.title,
      description: offer.description,
      subjectLabel: offer.subjectLabel,
      levelLabel: offer.levelLabel,
      mode: offer.mode,
      format: offer.format,
      location: offer.location,
      scheduleNote: offer.scheduleNote,
      startsOn: offer.startsOn,
      endsOn: offer.endsOn,
      totalMinutes: offer.totalMinutes,
      priceCents: offer.priceCents,
      currency: currencyById.get(offer.currencyId) ?? null,
      capacity: offer.capacity,
      seatsLeft: Math.max(0, offer.capacity - (takenByOffer.get(offer.id) ?? 0)),
      teacher: teachers.get(offer.employeeId) ?? "",
      school: {
        name: tenant.name,
        city: tenant.city,
        countryIsoCode: tenant.country.isoCode,
        countryNameFr: tenant.country.nameFr,
        countryNameEn: tenant.country.nameEn,
      },
    };
  });
}

/** « Awa M. » : prénom et initiale du nom, rien de plus du dossier RH. */
async function teacherNames(refs: { tenantId: string; employeeId: string }[]): Promise<Map<string, string>> {
  const byTenant = new Map<string, string[]>();
  for (const ref of refs) byTenant.set(ref.tenantId, [...(byTenant.get(ref.tenantId) ?? []), ref.employeeId]);
  const names = new Map<string, string>();
  for (const [tenantId, employeeIds] of byTenant) {
    const rows = await withTenantSession(tenantId, (tx) =>
      tx.employee.findMany({
        where: { id: { in: employeeIds } },
        select: { id: true, firstName: true, lastName: true },
      }),
    );
    for (const row of rows) names.set(row.id, `${row.firstName} ${row.lastName.charAt(0).toUpperCase()}.`);
  }
  return names;
}

// ---------------------------------------------------------------- Élèves que l'utilisateur peut inscrire

interface Learner {
  studentId: string;
  tenantId: string;
  enrolledAs: "PARENT" | "STUDENT";
}

async function listAuthorizedLearners(userId: string): Promise<Learner[]> {
  const [relationships, links] = await Promise.all([
    rawPrisma.parentStudentRelationship.findMany({
      where: { parentUserId: userId, status: "VERIFIED", revokedAt: null },
      select: { studentId: true, tenantId: true },
    }),
    rawPrisma.studentUserLink.findMany({ where: { userId }, select: { studentId: true, tenantId: true } }),
  ]);
  const learners = new Map<string, Learner>();
  for (const link of links) learners.set(link.studentId, { ...link, enrolledAs: "STUDENT" });
  for (const relationship of relationships)
    learners.set(relationship.studentId, { ...relationship, enrolledAs: "PARENT" });
  return [...learners.values()];
}

export async function listLearners(userId: string) {
  const learners = await listAuthorizedLearners(userId);
  const result = [];
  for (const learner of learners) {
    const student = await withTenantSession(learner.tenantId, (tx) =>
      tx.student.findUnique({
        where: { id: learner.studentId },
        select: { id: true, firstName: true, lastName: true, status: true, deletedAt: true },
      }),
    );
    if (!student || isStudentUnavailable(student)) continue;
    const tenant = await rawPrisma.tenant.findUnique({
      where: { id: learner.tenantId },
      select: { name: true },
    });
    result.push({
      studentId: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      schoolName: tenant?.name ?? "",
      enrolledAs: learner.enrolledAs,
    });
  }
  return result;
}

async function requireLearner(userId: string, studentId: string): Promise<Learner> {
  const learner = (await listAuthorizedLearners(userId)).find((entry) => entry.studentId === studentId);
  if (!learner) {
    throw new AppError(404, "LEARNER_NOT_FOUND", "No verified link between your account and this student");
  }
  const [student, tenant] = await Promise.all([
    withTenantSession(learner.tenantId, (tx) =>
      tx.student.findUnique({ where: { id: studentId }, select: { status: true, deletedAt: true } }),
    ),
    rawPrisma.tenant.findUnique({ where: { id: learner.tenantId }, select: { status: true } }),
  ]);
  if (!student || isStudentUnavailable(student) || !tenant || isTenantBlocked(tenant.status)) {
    throw new AppError(404, "LEARNER_NOT_FOUND", "No verified link between your account and this student");
  }
  return learner;
}

// ---------------------------------------------------------------- Inscriptions

function enrollmentReference(): string {
  return `RC-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

export async function enroll(userId: string, offerId: string, studentId: string) {
  const learner = await requireLearner(userId, studentId);

  const offer = await rawPrisma.remedialOffer.findUnique({ where: { id: offerId } });
  if (!offer || offer.status !== "PUBLISHED" || offer.endsOn < startOfToday()) {
    throw new AppError(404, "REMEDIAL_OFFER_NOT_AVAILABLE", "This course is not open for enrollment");
  }
  const offerTenant = await rawPrisma.tenant.findUnique({
    where: { id: offer.tenantId },
    select: { status: true },
  });
  if (!offerTenant || isTenantBlocked(offerTenant.status)) {
    throw new AppError(404, "REMEDIAL_OFFER_NOT_AVAILABLE", "This course is not open for enrollment");
  }

  return rawPrisma.$transaction(
    async (tx) => {
      const taken = await tx.remedialEnrollment.count({ where: { offerId, status: { not: "CANCELLED" } } });
      const existing = await tx.remedialEnrollment.findUnique({
        where: { offerId_studentId: { offerId, studentId } },
      });
      if (existing && existing.status !== "CANCELLED") {
        throw new AppError(409, "ALREADY_ENROLLED", "This student is already enrolled in this course");
      }
      if (taken >= offer.capacity) {
        throw new AppError(409, "REMEDIAL_OFFER_FULL", "This course is full");
      }
      const data = {
        offerTenantId: offer.tenantId,
        learnerTenantId: learner.tenantId,
        enrolledByUserId: userId,
        enrolledAs: learner.enrolledAs,
        status: "PENDING_PAYMENT" as const,
        amountCents: offer.priceCents,
        currencyId: offer.currencyId,
        cancelledAt: null,
        cancelReason: null,
      };
      return existing
        ? tx.remedialEnrollment.update({ where: { id: existing.id }, data })
        : tx.remedialEnrollment.create({
            data: { ...data, offerId, studentId, reference: enrollmentReference() },
          });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function requireOwnEnrollment(userId: string, enrollmentId: string) {
  const enrollment = await rawPrisma.remedialEnrollment.findUnique({
    where: { id: enrollmentId },
    include: { offer: true },
  });
  if (!enrollment) throw new AppError(404, "REMEDIAL_ENROLLMENT_NOT_FOUND", "Enrollment not found");
  const learners = await listAuthorizedLearners(userId);
  if (
    enrollment.enrolledByUserId !== userId &&
    !learners.some((learner) => learner.studentId === enrollment.studentId)
  ) {
    throw new AppError(404, "REMEDIAL_ENROLLMENT_NOT_FOUND", "Enrollment not found");
  }
  return enrollment;
}

export async function listMyEnrollments(userId: string) {
  const learners = await listAuthorizedLearners(userId);
  const enrollments = await rawPrisma.remedialEnrollment.findMany({
    where: {
      OR: [{ enrolledByUserId: userId }, { studentId: { in: learners.map((learner) => learner.studentId) } }],
    },
    include: { offer: true },
    orderBy: { createdAt: "desc" },
  });
  const [tenants, currencies, teachers] = await Promise.all([
    rawPrisma.tenant.findMany({
      where: { id: { in: [...new Set(enrollments.flatMap((e) => [e.offerTenantId, e.learnerTenantId]))] } },
      select: { id: true, name: true, city: true },
    }),
    rawPrisma.currency.findMany({
      where: { id: { in: [...new Set(enrollments.map((e) => e.currencyId))] } },
      select: { id: true, ...currencySelect },
    }),
    teacherNames(enrollments.map((e) => ({ tenantId: e.offerTenantId, employeeId: e.offer.employeeId }))),
  ]);
  const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  const currencyById = new Map(currencies.map((currency) => [currency.id, currency]));
  const studentNames = new Map<string, string>();
  for (const learner of learners) {
    const student = await withTenantSession(learner.tenantId, (tx) =>
      tx.student.findUnique({
        where: { id: learner.studentId },
        select: { firstName: true, lastName: true },
      }),
    );
    if (student) studentNames.set(learner.studentId, `${student.firstName} ${student.lastName}`);
  }

  return enrollments.map((enrollment) => {
    const confirmed = enrollment.status === "CONFIRMED" || enrollment.status === "COMPLETED";
    return {
      id: enrollment.id,
      reference: enrollment.reference,
      status: enrollment.status,
      amountCents: enrollment.amountCents,
      currency: currencyById.get(enrollment.currencyId) ?? null,
      studentName: studentNames.get(enrollment.studentId) ?? "",
      createdAt: enrollment.createdAt,
      confirmedAt: enrollment.confirmedAt,
      offer: {
        id: enrollment.offer.id,
        title: enrollment.offer.title,
        subjectLabel: enrollment.offer.subjectLabel,
        mode: enrollment.offer.mode,
        scheduleNote: enrollment.offer.scheduleNote,
        startsOn: enrollment.offer.startsOn,
        endsOn: enrollment.offer.endsOn,
        location: enrollment.offer.location,
        // Consignes et lien du cours : seulement une fois le paiement reçu.
        accessDetails: confirmed ? enrollment.offer.accessDetails : null,
        teacher: teachers.get(enrollment.offer.employeeId) ?? "",
        schoolName: tenantById.get(enrollment.offerTenantId)?.name ?? "",
        schoolCity: tenantById.get(enrollment.offerTenantId)?.city ?? null,
      },
    };
  });
}

export async function cancelEnrollment(userId: string, enrollmentId: string) {
  const enrollment = await requireOwnEnrollment(userId, enrollmentId);
  if (enrollment.status !== "PENDING_PAYMENT") {
    throw new AppError(
      409,
      "REMEDIAL_ENROLLMENT_NOT_CANCELLABLE",
      "Only an unpaid enrollment can be cancelled here",
    );
  }
  return rawPrisma.remedialEnrollment.update({
    where: { id: enrollment.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: "Annulée par la famille avant paiement",
    },
  });
}

// ---------------------------------------------------------------- Paiement en ligne

/** Opérateurs utilisables : actifs, branchés (adaptateur avec initiation) et du pays de l'enseignant ou de l'élève. */
export async function listPaymentOptions(userId: string, enrollmentId: string) {
  const enrollment = await requireOwnEnrollment(userId, enrollmentId);
  const [offerTenant, learnerTenant] = await Promise.all([
    rawPrisma.tenant.findUniqueOrThrow({
      where: { id: enrollment.offerTenantId },
      select: { name: true, countryId: true },
    }),
    rawPrisma.tenant.findUniqueOrThrow({
      where: { id: enrollment.learnerTenantId },
      select: { countryId: true },
    }),
  ]);
  const providers = await rawPrisma.paymentProvider.findMany({
    where: {
      isActive: true,
      code: { in: listInitiatingProviderCodes() },
      countryId: { in: [offerTenant.countryId, learnerTenant.countryId] },
    },
    select: { code: true, nameFr: true, nameEn: true, isTestMode: true },
    orderBy: { nameFr: "asc" },
  });
  return {
    providers,
    cash: { schoolName: offerTenant.name, reference: enrollment.reference },
  };
}

export async function payOnline(userId: string, enrollmentId: string, providerCode: string, phone: string) {
  const enrollment = await requireOwnEnrollment(userId, enrollmentId);
  if (enrollment.status !== "PENDING_PAYMENT") {
    throw new AppError(409, "REMEDIAL_ENROLLMENT_NOT_PAYABLE", "This enrollment is not awaiting payment");
  }
  const options = await listPaymentOptions(userId, enrollmentId);
  const providerRow = options.providers.find((provider) => provider.code === providerCode);
  const adapter = getPaymentProviderAdapter(providerCode);
  if (!providerRow || !adapter?.initiatePayment) {
    throw new AppError(
      422,
      "PAYMENT_PROVIDER_UNAVAILABLE",
      "This payment method is not available for this course",
    );
  }

  const [provider, currency] = await Promise.all([
    rawPrisma.paymentProvider.findUniqueOrThrow({ where: { code: providerCode } }),
    rawPrisma.currency.findUniqueOrThrow({ where: { id: enrollment.currencyId } }),
  ]);
  const intent = await rawPrisma.paymentIntent.create({
    data: {
      providerId: provider.id,
      purpose: "REMEDIAL_COURSE",
      remedialEnrollmentId: enrollment.id,
      amountCents: enrollment.amountCents,
      currencyId: enrollment.currencyId,
      idempotencyKey: `RC-${enrollment.reference}-${randomBytes(3).toString("hex").toUpperCase()}`,
    },
  });

  try {
    const result = await adapter.initiatePayment({
      merchantReference: intent.idempotencyKey,
      amountCents: intent.amountCents,
      currencyIsoCode: currency.isoCode,
      currencyDecimalDigits: currency.decimalDigits,
      customerPhone: phone,
      description: `Cours de renforcement ${enrollment.reference} — ${enrollment.offer.title}`,
    });
    return {
      paymentIntentId: intent.id,
      status: "PENDING" as const,
      customerMessage: result.customerMessage,
    };
  } catch (error) {
    logger.error({ err: error, providerCode, enrollmentId }, "Remedial payment initiation failed");
    await rawPrisma.paymentIntent.update({ where: { id: intent.id }, data: { status: "FAILED" } });
    throw new AppError(502, "PAYMENT_INITIATION_FAILED", "The payment operator did not accept the request");
  }
}

export async function getPaymentStatus(userId: string, enrollmentId: string, paymentIntentId: string) {
  const enrollment = await requireOwnEnrollment(userId, enrollmentId);
  const intent = await rawPrisma.paymentIntent.findFirst({
    where: { id: paymentIntentId, remedialEnrollmentId: enrollment.id },
    select: { status: true },
  });
  if (!intent) throw new AppError(404, "PAYMENT_INTENT_NOT_FOUND", "Payment not found");
  return { paymentStatus: intent.status, enrollmentStatus: enrollment.status };
}
