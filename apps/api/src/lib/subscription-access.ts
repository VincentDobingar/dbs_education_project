import type { Subscription } from "@prisma/client";
import type { Request } from "express";

import { prisma } from "./prisma.js";

const ACTIVE_SUBSCRIPTION_STATUSES = ["ACTIVE", "TRIAL", "GRACE_PERIOD"] as const;

export interface SubscriptionOwnerContext {
  tenantId?: string;
  familyAccountId?: string;
  studentId?: string;
  organizationId?: string;
}

/** Default resolver for the common case: the tenant already locked in by enforceTenantScope. */
export function tenantOwnerContext(req: Request): SubscriptionOwnerContext | null {
  return req.tenant ? { tenantId: req.tenant.id } : null;
}

export async function findActiveSubscription(
  context: SubscriptionOwnerContext,
): Promise<Subscription | null> {
  const owner = await prisma.subscriptionOwner.findFirst({ where: context });

  if (!owner) {
    return null;
  }

  return prisma.subscription.findFirst({
    where: { ownerId: owner.id, status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] } },
    orderBy: { createdAt: "desc" },
  });
}
