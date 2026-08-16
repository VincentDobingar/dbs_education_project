import type { Prisma, Subscription, SubscriberCategory, SubscriptionStatus } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma, type PrismaTransactionClient } from "../../lib/prisma.js";

import { ACTIVE_LIKE_STATUSES, isTransitionAllowed } from "./subscription-transitions.js";

export interface SubscriptionOwnerRef {
  tenantId?: string;
  familyAccountId?: string;
  studentId?: string;
  organizationId?: string;
}

interface TransitionOptions {
  reason?: string;
  actorUserId?: string;
  metadata?: Record<string, unknown>;
}

export type Tx = PrismaTransactionClient;

/**
 * A SubscriptionOwner is the stable polymorphic anchor (§33); it is created once
 * per owner and reused across however many Subscription rows that owner has over
 * time (renewals, plan changes).
 */
async function findOrCreateOwner(tx: Tx, ownerType: SubscriberCategory, ownerRef: SubscriptionOwnerRef) {
  const existing = await tx.subscriptionOwner.findFirst({ where: ownerRef });
  if (existing) {
    return existing;
  }
  return tx.subscriptionOwner.create({ data: { ownerType, ...ownerRef } });
}

/**
 * Validates a promotion code against the subscription it is being redeemed for
 * (§31: PromotionCode CRUD is super-admin only, but consuming one during a real
 * signup/subscription flow is what makes redemptionCount meaningful) and, if
 * valid, records the PromotionRedemption and bumps the counter — all inside the
 * caller's transaction so a failed redemption rolls back the subscription too.
 */
async function redeemPromotionCode(
  tx: Tx,
  code: string,
  ownerType: SubscriberCategory,
  subscriptionId: string,
  redeemedByUserId: string | undefined,
): Promise<void> {
  const promotionCode = await tx.promotionCode.findUnique({ where: { code } });
  if (!promotionCode) {
    throw new AppError(404, "PROMOTION_CODE_NOT_FOUND", `Unknown promotion code: ${code}`);
  }
  if (!promotionCode.isActive) {
    throw new AppError(409, "PROMOTION_CODE_INACTIVE", `Promotion code is not active: ${code}`);
  }

  const now = new Date();
  if (promotionCode.startsAt && now < promotionCode.startsAt) {
    throw new AppError(409, "PROMOTION_CODE_NOT_STARTED", `Promotion code is not yet active: ${code}`);
  }
  if (promotionCode.endsAt && now > promotionCode.endsAt) {
    throw new AppError(409, "PROMOTION_CODE_EXPIRED", `Promotion code has expired: ${code}`);
  }
  if (promotionCode.applicableCategory && promotionCode.applicableCategory !== ownerType) {
    throw new AppError(
      422,
      "PROMOTION_CODE_CATEGORY_MISMATCH",
      `Promotion code ${code} does not apply to category ${ownerType}`,
    );
  }
  if (
    promotionCode.maxRedemptions !== null &&
    promotionCode.redemptionCount >= promotionCode.maxRedemptions
  ) {
    throw new AppError(
      409,
      "PROMOTION_CODE_EXHAUSTED",
      `Promotion code has reached its redemption limit: ${code}`,
    );
  }

  await tx.promotionRedemption.create({
    data: {
      promotionCodeId: promotionCode.id,
      subscriptionId,
      ...(redeemedByUserId ? { redeemedByUserId } : {}),
    },
  });
  await tx.promotionCode.update({
    where: { id: promotionCode.id },
    data: { redemptionCount: { increment: 1 } },
  });
}

/**
 * Recomputes Entitlement rows from the plan's PlanFeature list. Called on every
 * transition (§6: "les droits doivent être recalculés après chaque changement")
 * — controllers must never derive access from the plan directly, only from this
 * materialized table (requireEntitlement() reads only Entitlement).
 */
async function recalculateEntitlements(tx: Tx, subscription: Subscription): Promise<void> {
  const isActiveLike = ACTIVE_LIKE_STATUSES.has(subscription.status);
  const features = await tx.planFeature.findMany({ where: { planId: subscription.planId } });

  for (const feature of features) {
    await tx.entitlement.upsert({
      where: {
        subscriptionId_featureCode: { subscriptionId: subscription.id, featureCode: feature.featureCode },
      },
      update: {
        isEnabled: isActiveLike && feature.isIncluded,
        quotaLimit: feature.quotaLimit,
        computedAt: new Date(),
      },
      create: {
        subscriptionId: subscription.id,
        featureCode: feature.featureCode,
        isEnabled: isActiveLike && feature.isIncluded,
        quotaLimit: feature.quotaLimit,
      },
    });
  }
}

export interface CreateDraftSubscriptionInput {
  ownerType: SubscriberCategory;
  ownerRef: SubscriptionOwnerRef;
  planCode: string;
  fundingSource: Subscription["fundingSource"];
  billingPeriod: Subscription["billingPeriod"];
  promoCode?: string;
  redeemedByUserId?: string;
}

export async function createDraftSubscription(input: CreateDraftSubscriptionInput): Promise<Subscription> {
  const plan = await prisma.subscriptionPlan.findUnique({ where: { code: input.planCode } });

  if (!plan || !plan.isActive) {
    throw new AppError(404, "PLAN_NOT_FOUND", `Unknown or inactive plan: ${input.planCode}`);
  }

  if (plan.category !== input.ownerType) {
    throw new AppError(
      422,
      "PLAN_CATEGORY_MISMATCH",
      `Plan ${input.planCode} is not for category ${input.ownerType}`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const owner = await findOrCreateOwner(tx, input.ownerType, input.ownerRef);

    const subscription = await tx.subscription.create({
      data: {
        ownerId: owner.id,
        planId: plan.id,
        status: "DRAFT",
        fundingSource: input.fundingSource,
        billingPeriod: input.billingPeriod,
      },
    });

    await tx.subscriptionEvent.create({
      data: { subscriptionId: subscription.id, toStatus: "DRAFT" },
    });

    if (input.promoCode) {
      await redeemPromotionCode(
        tx,
        input.promoCode,
        input.ownerType,
        subscription.id,
        input.redeemedByUserId,
      );
    }

    return subscription;
  });
}

/**
 * Core transition logic, reusable inside a transaction another service already
 * opened (e.g. payment.service.ts applying ACTIVE as part of handling a
 * successful payment, atomically with marking the invoice paid). Validates the
 * transition, stamps the relevant timestamp fields, writes an immutable
 * SubscriptionEvent, and recalculates entitlements.
 */
export async function applySubscriptionTransition(
  tx: Tx,
  subscriptionId: string,
  toStatus: SubscriptionStatus,
  options: TransitionOptions = {},
): Promise<Subscription> {
  const subscription = await tx.subscription.findUnique({ where: { id: subscriptionId } });

  if (!subscription) {
    throw new AppError(404, "SUBSCRIPTION_NOT_FOUND", "Subscription not found");
  }

  if (!isTransitionAllowed(subscription.status, toStatus)) {
    throw new AppError(
      409,
      "INVALID_SUBSCRIPTION_TRANSITION",
      `Cannot transition subscription from ${subscription.status} to ${toStatus}`,
    );
  }

  const data: Prisma.SubscriptionUpdateInput = { status: toStatus };

  if (toStatus === "ACTIVE" && !subscription.startsAt) {
    data.startsAt = new Date();
  }
  if (toStatus === "CANCELLED") {
    data.cancelledAt = new Date();
    if (options.reason) data.cancelReason = options.reason;
  }
  if (
    (toStatus === "EXPIRED" || toStatus === "CANCELLED" || toStatus === "REFUNDED") &&
    !subscription.endsAt
  ) {
    data.endsAt = new Date();
  }

  const updated = await tx.subscription.update({ where: { id: subscriptionId }, data });

  await tx.subscriptionEvent.create({
    data: {
      subscriptionId,
      fromStatus: subscription.status,
      toStatus,
      ...(options.reason ? { reason: options.reason } : {}),
      ...(options.actorUserId ? { actorUserId: options.actorUserId } : {}),
      ...(options.metadata ? { metadata: options.metadata as Prisma.InputJsonValue } : {}),
    },
  });

  await recalculateEntitlements(tx, updated);

  return updated;
}

/** Public entry point: opens its own transaction. Use applySubscriptionTransition
 * directly when a transition must be atomic with other writes already inside a tx. */
export async function transitionSubscription(
  subscriptionId: string,
  toStatus: SubscriptionStatus,
  options: TransitionOptions = {},
): Promise<Subscription> {
  return prisma.$transaction((tx) => applySubscriptionTransition(tx, subscriptionId, toStatus, options));
}

export async function findSubscriptionForOwner(ownerRef: SubscriptionOwnerRef): Promise<Subscription | null> {
  const owner = await prisma.subscriptionOwner.findFirst({ where: ownerRef });
  if (!owner) {
    return null;
  }
  return prisma.subscription.findFirst({ where: { ownerId: owner.id }, orderBy: { createdAt: "desc" } });
}
