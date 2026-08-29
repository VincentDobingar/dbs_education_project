import type {
  FundingSource,
  LicenseAssignment,
  LicenseBatch,
  Prisma,
  SponsoredLicense,
  SubscriberCategory,
} from "@prisma/client";

import { recordAuditLog } from "../../lib/audit-log.js";
import { AppError } from "../../lib/errors.js";
import { prisma, withTenantSession } from "../../lib/prisma.js";
import { requireFamilyAccountForUser } from "../family/family-account.service.js";
import {
  applySubscriptionTransition,
  createDraftSubscriptionInTx,
  type SubscriptionOwnerRef,
} from "../subscriptions/subscription.service.js";

import type {
  AssignLicenseInput,
  CreateLicenseBatchInput,
  ListLicenseBatchesQuery,
  ListLicensesQuery,
  RevokeLicenseInput,
} from "./license-admin.validation.js";
import type { PlatformActor } from "./platform-actor.js";

export type LicenseBatchWithLicenses = LicenseBatch & { licenses: SponsoredLicense[] };
export type LicenseWithAssignments = SponsoredLicense & { assignments: LicenseAssignment[] };

/**
 * Ni LicenseBatch ni SponsoredLicense ni LicenseAssignment ne sont des modèles
 * tenant-scoped (sponsorTenantId est une chaîne libre indexée, pas une colonne de
 * garde) — le client gardé `prisma` suffit. Ce module ne modifie jamais un
 * Subscription *existant* passé en subscriptionId (fundingSource, entitlements) :
 * LicenseAssignment se contente alors de tracer quelle licence couvre quel
 * abonnement déjà créé par les flux existants (subscriptions/subscription.service.ts).
 * Quand subscriptionId est omis, assignLicense crée lui-même cet abonnement (statut
 * DRAFT puis ACTIVE, fundingSource de la licence) dans la même transaction que la
 * LicenseAssignment — jusque-là un bénéficiaire sponsorisé n'obtenait jamais
 * d'abonnement réel sans un contournement manuel via forceTransition. Comme les
 * tranches 3-6, la justification reste optionnelle.
 */

async function auditLicenseEntity(
  actor: PlatformActor,
  action: string,
  entityType: "LicenseBatch" | "SponsoredLicense",
  entityId: string,
  tenantId: string | null,
  beforeData: Prisma.InputJsonValue | undefined,
  afterData: Prisma.InputJsonValue,
): Promise<void> {
  await recordAuditLog({
    tenantId,
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action,
    entityType,
    entityId,
    ...(beforeData !== undefined ? { beforeData } : {}),
    afterData,
    ...(actor.justification ? { justification: actor.justification } : {}),
  });
}

async function requirePlanExists(planId: string): Promise<void> {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan) {
    throw new AppError(404, "PLAN_NOT_FOUND", `Subscription plan not found: ${planId}`);
  }
}

async function requireCurrencyExists(currencyId: string): Promise<void> {
  const currency = await prisma.currency.findUnique({ where: { id: currencyId } });
  if (!currency) {
    throw new AppError(404, "CURRENCY_NOT_FOUND", `Currency not found: ${currencyId}`);
  }
}

async function requireTenantExists(tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw new AppError(404, "TENANT_NOT_FOUND", `Tenant not found: ${tenantId}`);
  }
}

async function requireOrganizationExists(organizationId: string): Promise<void> {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization || organization.deletedAt) {
    throw new AppError(404, "ORGANIZATION_NOT_FOUND", `Organization not found: ${organizationId}`);
  }
}

export async function listLicenseBatches(query: ListLicenseBatchesQuery): Promise<LicenseBatch[]> {
  return prisma.licenseBatch.findMany({
    where: {
      ...(query.sponsorTenantId !== undefined ? { sponsorTenantId: query.sponsorTenantId } : {}),
      ...(query.sponsorOrganizationId !== undefined
        ? { sponsorOrganizationId: query.sponsorOrganizationId }
        : {}),
      ...(query.planId !== undefined ? { planId: query.planId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function requireLicenseBatch(id: string): Promise<LicenseBatchWithLicenses> {
  const batch = await prisma.licenseBatch.findUnique({
    where: { id },
    include: { licenses: true },
  });
  if (!batch) {
    throw new AppError(404, "LICENSE_BATCH_NOT_FOUND", `License batch not found: ${id}`);
  }
  return batch;
}

export async function createLicenseBatch(
  input: CreateLicenseBatchInput,
  actor: PlatformActor,
): Promise<LicenseBatchWithLicenses> {
  await requirePlanExists(input.planId);
  await requireCurrencyExists(input.currencyId);
  if (input.purchaserType === "TENANT") {
    await requireTenantExists(input.sponsorTenantId as string);
  } else {
    await requireOrganizationExists(input.sponsorOrganizationId as string);
  }

  const fundingSource: FundingSource =
    input.purchaserType === "TENANT" ? "SCHOOL_SPONSORED" : "ORGANIZATION_SPONSORED";

  const batch = await prisma.$transaction(async (tx) => {
    const created = await tx.licenseBatch.create({
      data: {
        planId: input.planId,
        purchaserType: input.purchaserType,
        ...(input.sponsorTenantId !== undefined ? { sponsorTenantId: input.sponsorTenantId } : {}),
        ...(input.sponsorOrganizationId !== undefined
          ? { sponsorOrganizationId: input.sponsorOrganizationId }
          : {}),
        quantity: input.quantity,
        unitPriceCents: input.unitPriceCents,
        currencyId: input.currencyId,
        ...(input.purchasedAt !== undefined ? { purchasedAt: input.purchasedAt } : {}),
      },
    });

    await tx.sponsoredLicense.createMany({
      data: Array.from({ length: input.quantity }, () => ({
        batchId: created.id,
        planId: input.planId,
        fundingSource,
        status: "AVAILABLE" as const,
        ...(input.sponsorTenantId !== undefined ? { sponsorTenantId: input.sponsorTenantId } : {}),
        ...(input.sponsorOrganizationId !== undefined
          ? { sponsorOrganizationId: input.sponsorOrganizationId }
          : {}),
      })),
    });

    const licenses = await tx.sponsoredLicense.findMany({ where: { batchId: created.id } });
    return { ...created, licenses };
  });

  await auditLicenseEntity(
    actor,
    "license_batch.create",
    "LicenseBatch",
    batch.id,
    input.sponsorTenantId ?? null,
    undefined,
    { quantity: batch.quantity, planId: batch.planId },
  );
  return batch;
}

export async function listLicenses(query: ListLicensesQuery): Promise<SponsoredLicense[]> {
  return prisma.sponsoredLicense.findMany({
    where: {
      ...(query.batchId !== undefined ? { batchId: query.batchId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.sponsorTenantId !== undefined ? { sponsorTenantId: query.sponsorTenantId } : {}),
      ...(query.sponsorOrganizationId !== undefined
        ? { sponsorOrganizationId: query.sponsorOrganizationId }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function requireLicense(id: string): Promise<LicenseWithAssignments> {
  const license = await prisma.sponsoredLicense.findUnique({
    where: { id },
    include: { assignments: { orderBy: { assignedAt: "desc" } } },
  });
  if (!license) {
    throw new AppError(404, "LICENSE_NOT_FOUND", `Sponsored license not found: ${id}`);
  }
  return license;
}

/** Résout l'ownerRef/ownerType du bénéficiaire pour créer son abonnement — même
 * correspondance que les routes self-service (subscription.controller.ts) :
 * PARENT exige un FamilyAccount déjà créé (aucune création implicite de
 * Guardian/FamilyAccount ici, hors périmètre de ce correctif ; FamilyAccount n'est
 * pas un modèle tenant-scoped, prisma suffit). STUDENT se résout par studentId
 * comme createStudentSubscription, mais Student EST tenant-scoped (RLS) — la
 * validation Zod exige donc un tenantId ici, sans quoi la lecture échouerait
 * (« Tenant context missing »), et withTenantSession fixe app.tenant_id pour
 * cette seule lecture. */
async function resolveBeneficiaryOwner(
  input: AssignLicenseInput,
): Promise<{ ownerType: SubscriberCategory; ownerRef: SubscriptionOwnerRef }> {
  if (input.beneficiaryType === "PARENT") {
    const familyAccount = await requireFamilyAccountForUser(input.beneficiaryUserId as string);
    return { ownerType: "PARENT", ownerRef: { familyAccountId: familyAccount.id } };
  }
  const studentId = input.beneficiaryStudentId as string;
  const student = await withTenantSession(input.tenantId as string, (tx) =>
    tx.student.findUnique({ where: { id: studentId } }),
  );
  if (!student || student.deletedAt) {
    throw new AppError(404, "STUDENT_NOT_FOUND", `Student not found: ${studentId}`);
  }
  return { ownerType: "STUDENT", ownerRef: { studentId: student.id } };
}

export async function assignLicense(
  id: string,
  input: AssignLicenseInput,
  actor: PlatformActor,
): Promise<SponsoredLicense> {
  const license = await requireLicense(id);
  if (license.status !== "AVAILABLE") {
    throw new AppError(409, "LICENSE_NOT_AVAILABLE", `Sponsored license is not available: ${id}`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    let subscriptionId = input.subscriptionId;

    if (subscriptionId) {
      const subscription = await tx.subscription.findUnique({ where: { id: subscriptionId } });
      if (!subscription) {
        throw new AppError(404, "SUBSCRIPTION_NOT_FOUND", `Subscription not found: ${subscriptionId}`);
      }
    } else {
      if (!input.billingPeriod) {
        throw new AppError(
          422,
          "BILLING_PERIOD_REQUIRED",
          "billingPeriod is required when creating a new subscription",
        );
      }
      const { ownerType, ownerRef } = await resolveBeneficiaryOwner(input);
      const plan = await tx.subscriptionPlan.findUnique({ where: { id: license.planId } });
      if (!plan) {
        throw new AppError(404, "PLAN_NOT_FOUND", `Subscription plan not found: ${license.planId}`);
      }
      if (plan.category !== ownerType) {
        throw new AppError(
          422,
          "PLAN_CATEGORY_MISMATCH",
          `License plan ${plan.code} is not for category ${ownerType}`,
        );
      }

      const subscription = await createDraftSubscriptionInTx(tx, plan, {
        ownerType,
        ownerRef,
        planCode: plan.code,
        fundingSource: license.fundingSource,
        billingPeriod: input.billingPeriod,
      });
      // Un bénéficiaire sponsorisé ne paie rien : on saute directement à ACTIVE,
      // sans passer par le pipeline facture/paiement réservé au self-service
      // SELF_PAID. La machine à états (subscription-transitions.ts) n'autorise
      // toutefois pas DRAFT -> ACTIVE en un seul saut (seul PENDING_PAYMENT ->
      // ACTIVE et PENDING_ACTIVATION -> ACTIVE le sont) — on traverse donc
      // PENDING_PAYMENT dans la même transaction, sans jamais émettre de facture.
      await applySubscriptionTransition(tx, subscription.id, "PENDING_PAYMENT", {
        reason: "Financement par licence sponsorisée, aucune facture émise",
        actorUserId: actor.actorUserId,
      });
      await applySubscriptionTransition(tx, subscription.id, "ACTIVE", {
        reason: "Activation via licence sponsorisée",
        actorUserId: actor.actorUserId,
      });
      subscriptionId = subscription.id;
    }

    await tx.licenseAssignment.create({
      data: {
        licenseId: id,
        beneficiaryType: input.beneficiaryType,
        ...(input.beneficiaryUserId !== undefined ? { beneficiaryUserId: input.beneficiaryUserId } : {}),
        ...(input.beneficiaryStudentId !== undefined
          ? { beneficiaryStudentId: input.beneficiaryStudentId }
          : {}),
        subscriptionId,
      },
    });
    return tx.sponsoredLicense.update({ where: { id }, data: { status: "ASSIGNED" } });
  });

  await auditLicenseEntity(
    actor,
    "license.assign",
    "SponsoredLicense",
    id,
    license.sponsorTenantId,
    { status: license.status },
    { status: updated.status, subscriptionId: input.subscriptionId ?? "created" },
  );
  return updated;
}

export async function revokeLicense(
  id: string,
  input: RevokeLicenseInput,
  actor: PlatformActor,
): Promise<SponsoredLicense> {
  const license = await requireLicense(id);
  if (license.status === "REVOKED") {
    throw new AppError(409, "LICENSE_ALREADY_REVOKED", `Sponsored license already revoked: ${id}`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const activeAssignment = license.assignments.find((assignment) => !assignment.revokedAt);
    if (activeAssignment) {
      await tx.licenseAssignment.update({
        where: { id: activeAssignment.id },
        data: {
          revokedAt: new Date(),
          ...(input.reason !== undefined ? { revokedReason: input.reason } : {}),
        },
      });
    }
    return tx.sponsoredLicense.update({ where: { id }, data: { status: "REVOKED" } });
  });

  await auditLicenseEntity(
    actor,
    "license.revoke",
    "SponsoredLicense",
    id,
    license.sponsorTenantId,
    { status: license.status },
    { status: updated.status },
  );
  return updated;
}
