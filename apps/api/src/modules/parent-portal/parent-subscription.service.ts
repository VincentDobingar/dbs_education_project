import type { Prisma, Subscription } from "@prisma/client";
import { z } from "zod";

import { AppError } from "../../lib/errors.js";
import { rawPrisma, type PrismaTransactionClient } from "../../lib/prisma.js";
import { isStudentUnavailable } from "../../lib/student-status.js";
import { findActiveSubscription } from "../../lib/subscription-access.js";
import { isTenantBlocked } from "../../lib/tenant-status.js";
import { listVerifiedChildrenForParent } from "../family/parent-student-relationship.service.js";
import {
  advanceSubscriptionIfDue,
  createDraftSubscriptionInTx,
} from "../subscriptions/subscription.service.js";
import { BILLING_PERIODS } from "../subscriptions/subscription.validation.js";

import { getParentProfile } from "./parent-profile.service.js";

export const coverageSelectionSchema = z
  .object({
    children: z
      .array(z.object({ studentId: z.string().min(1), tenantId: z.string().min(1) }).strict())
      .min(1)
      .max(50),
  })
  .refine(
    (input) =>
      new Set(input.children.map((c) => `${c.studentId}:${c.tenantId}`)).size === input.children.length,
    "Un enfant ne peut apparaître deux fois",
  );
export const parentSubscriptionSchema = z
  .object({
    planCode: z.string().min(1),
    billingPeriod: z.enum(BILLING_PERIODS),
    promoCode: z.string().min(1).optional(),
    children: z
      .array(z.object({ studentId: z.string().min(1), tenantId: z.string().min(1) }).strict())
      .min(1)
      .max(50),
  })
  .superRefine((input, ctx) => {
    if (new Set(input.children.map((c) => `${c.studentId}:${c.tenantId}`)).size !== input.children.length)
      ctx.addIssue({ code: "custom", message: "Sélection en double", path: ["children"] });
  });
type ChildSelection = z.infer<typeof coverageSelectionSchema>["children"];

export async function requireParentSubscription(userId: string, subscriptionId: string) {
  const subscription = await rawPrisma.subscription.findFirst({
    where: {
      id: subscriptionId,
      deletedAt: null,
      owner: { ownerType: "PARENT", familyAccount: { primaryUserId: userId, deletedAt: null } },
    },
    include: { plan: true, parentCoverages: true },
  });
  if (!subscription) throw new AppError(404, "SUBSCRIPTION_NOT_FOUND", "Abonnement introuvable");
  return subscription;
}

export async function findCoveredParentSubscription(
  userId: string,
  studentId: string,
  tenantId: string,
): Promise<Subscription | null> {
  const relationship = await rawPrisma.parentStudentRelationship.findFirst({
    where: { parentUserId: userId, studentId, tenantId, status: "VERIFIED", revokedAt: null },
  });
  if (!relationship) return null;
  const coverage = await rawPrisma.parentSubscriptionCoverage.findFirst({
    where: { parentUserId: userId, studentId, tenantId, releasedAt: null },
    include: { subscription: { include: { owner: { include: { familyAccount: true } } } } },
  });
  const owner = coverage?.subscription.owner;
  if (
    !coverage ||
    owner?.ownerType !== "PARENT" ||
    !owner.familyAccountId ||
    owner.familyAccount?.primaryUserId !== userId ||
    owner.familyAccount.deletedAt ||
    coverage.subscription.deletedAt
  )
    return null;
  const subscription = await findActiveSubscription({
    familyAccountId: owner.familyAccountId,
    subscriptionId: coverage.subscriptionId,
  });
  // ACTIVE seulement : ni brouillon, ni essai, ni grâce ne constitue une couverture payée active.
  return subscription?.status === "ACTIVE" ? subscription : null;
}

async function addCoverages(
  tx: Prisma.TransactionClient,
  userId: string,
  subscription: Subscription,
  children: ChildSelection,
): Promise<void> {
  const plan = await tx.subscriptionPlan.findUniqueOrThrow({ where: { id: subscription.planId } });
  if (children.length > (plan.childrenCovered ?? 1))
    throw new AppError(422, "PLAN_CHILD_LIMIT", "Le nombre d'enfants dépasse la capacité du forfait");
  for (const child of [...children].sort((a, b) => a.studentId.localeCompare(b.studentId))) {
    await tx.$queryRaw`SELECT id FROM "ParentStudentRelationship" WHERE "parentUserId" = ${userId} AND "studentId" = ${child.studentId} AND "tenantId" = ${child.tenantId} FOR SHARE`;
    const relationship = await tx.parentStudentRelationship.findFirst({
      where: { parentUserId: userId, ...child, status: "VERIFIED", revokedAt: null },
    });
    if (!relationship)
      throw new AppError(
        403,
        "STUDENT_RELATIONSHIP_NOT_VERIFIED",
        "Cet enfant n'est pas rattaché à votre compte",
      );
    const tenant = await tx.tenant.findUnique({ where: { id: child.tenantId } });
    if (!tenant || tenant.deletedAt || isTenantBlocked(tenant.status))
      throw new AppError(403, "TENANT_BLOCKED", "Établissement indisponible");
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${child.tenantId}, true)`;
    const student = await tx.student.findUnique({ where: { id: child.studentId } });
    if (!student || isStudentUnavailable(student))
      throw new AppError(403, "STUDENT_UNAVAILABLE", "Dossier élève indisponible");
    const current = await tx.parentSubscriptionCoverage.findFirst({
      where: { ...child, releasedAt: null },
      include: { subscription: true },
    });
    const currentParentLink = current
      ? await tx.parentStudentRelationship.findFirst({
          where: { parentUserId: current.parentUserId, ...child, status: "VERIFIED", revokedAt: null },
        })
      : null;
    if (
      current &&
      (!currentParentLink ||
        current.subscription.deletedAt ||
        ["EXPIRED", "CANCELLED", "REFUNDED"].includes(current.subscription.status))
    ) {
      await tx.parentSubscriptionCoverage.update({
        where: { id: current.id },
        data: { releasedAt: new Date() },
      });
    }
    await tx.parentSubscriptionCoverage.create({
      data: { parentUserId: userId, ...child, subscriptionId: subscription.id },
    });
  }
}

async function advanceSelected(children: ChildSelection): Promise<void> {
  const current = await rawPrisma.parentSubscriptionCoverage.findMany({
    where: { releasedAt: null, OR: children },
    include: { subscription: true },
  });
  for (const coverage of current) await advanceSubscriptionIfDue(coverage.subscription);
}

export async function createParentSubscription(
  userId: string,
  input: z.infer<typeof parentSubscriptionSchema>,
) {
  // Vérifier les relations avant tout traitement d'abonnements d'autrui.
  for (const child of input.children) {
    if (
      !(await rawPrisma.parentStudentRelationship.findFirst({
        where: { parentUserId: userId, ...child, status: "VERIFIED", revokedAt: null },
      }))
    )
      throw new AppError(403, "STUDENT_RELATIONSHIP_NOT_VERIFIED", "Lien parent-enfant requis");
  }
  const profile = await getParentProfile(userId);
  const plan = await rawPrisma.subscriptionPlan.findUnique({ where: { code: input.planCode } });
  if (!plan?.isActive || plan.category !== "PARENT")
    throw new AppError(422, "PARENT_PLAN_REQUIRED", "Choisissez une formule parent active");
  await advanceSelected(input.children);
  return rawPrisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      let family = await tx.familyAccount.findFirst({ where: { primaryUserId: userId, deletedAt: null } });
      if (!family)
        family = await tx.familyAccount.create({
          data: {
            primaryUserId: userId,
            members: { create: { guardianId: profile.id, roleInFamily: "PRIMARY" } },
          },
        });
      // Le helper existant est typé pour le client étendu ; ici il n'utilise que
      // les tables globales d'abonnement dans cette transaction brute atomique.
      const subscription = await createDraftSubscriptionInTx(tx as unknown as PrismaTransactionClient, plan, {
        ownerType: "PARENT",
        ownerRef: { familyAccountId: family.id },
        planCode: input.planCode,
        fundingSource: "SELF_PAID",
        billingPeriod: input.billingPeriod,
        redeemedByUserId: userId,
        ...(input.promoCode ? { promoCode: input.promoCode } : {}),
      });
      await addCoverages(tx, userId, subscription, input.children);
      return subscription;
    },
    { timeout: 15000 },
  );
}

export async function attachParentCoverage(userId: string, id: string, children: ChildSelection) {
  await requireParentSubscription(userId, id);
  for (const child of children) {
    if (
      !(await rawPrisma.parentStudentRelationship.findFirst({
        where: { parentUserId: userId, ...child, status: "VERIFIED", revokedAt: null },
      }))
    )
      throw new AppError(403, "STUDENT_RELATIONSHIP_NOT_VERIFIED", "Lien parent-enfant requis");
  }
  await advanceSelected(children);
  return rawPrisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Subscription" WHERE id = ${id} FOR UPDATE`;
      const subscription = await tx.subscription.findUniqueOrThrow({ where: { id } });
      if (["EXPIRED", "CANCELLED", "REFUNDED"].includes(subscription.status))
        throw new AppError(409, "SUBSCRIPTION_INACTIVE", "Abonnement terminé");
      if (await tx.parentSubscriptionCoverage.count({ where: { subscriptionId: id } }))
        throw new AppError(
          409,
          "COVERAGE_ALREADY_SELECTED",
          "La sélection est déjà fixée pour cet abonnement",
        );
      await addCoverages(tx, userId, subscription, children);
      return subscription;
    },
    { timeout: 15000 },
  );
}

export async function listParentSubscriptions(userId: string) {
  const rows = await rawPrisma.subscription.findMany({
    where: {
      deletedAt: null,
      owner: { ownerType: "PARENT", familyAccount: { primaryUserId: userId, deletedAt: null } },
    },
    include: {
      plan: { select: { code: true, nameFr: true, childrenCovered: true } },
      parentCoverages: true,
      invoices: {
        orderBy: { createdAt: "desc" },
        select: { id: true, number: true, totalCents: true, status: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  for (const row of rows) row.status = (await advanceSubscriptionIfDue(row)).status;
  return rows;
}

export async function listCoverageOptions(userId: string) {
  const children = await listVerifiedChildrenForParent(userId);
  const result = [];
  for (const { student } of children) {
    if (isStudentUnavailable(student)) continue;
    const tenant = await rawPrisma.tenant.findUnique({ where: { id: student.tenantId } });
    if (!tenant || tenant.deletedAt || isTenantBlocked(tenant.status)) continue;
    const subscription = await findCoveredParentSubscription(userId, student.id, student.tenantId);
    result.push({
      studentId: student.id,
      tenantId: student.tenantId,
      firstName: student.firstName,
      lastName: student.lastName,
      tenantName: tenant.name,
      covered: Boolean(subscription),
    });
  }
  return result;
}
