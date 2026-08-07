import type { NextFunction, Request, Response } from "express";

import { prisma } from "../lib/prisma.js";
import {
  findActiveSubscription,
  tenantOwnerContext,
  type SubscriptionOwnerContext,
} from "../lib/subscription-access.js";

type OwnerContextResolver = (req: Request) => SubscriptionOwnerContext | null;

export function requireEntitlement(
  featureCode: string,
  resolveOwnerContext: OwnerContextResolver = tenantOwnerContext,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void (async () => {
      const context = resolveOwnerContext(req);

      if (!context) {
        res
          .status(403)
          .json({ code: "SUBSCRIPTION_OWNER_UNRESOLVED", message: "No subscription owner for this request" });
        return;
      }

      const subscription = await findActiveSubscription(context);

      if (!subscription) {
        res
          .status(402)
          .json({ code: "SUBSCRIPTION_INACTIVE", message: "No active subscription for this account" });
        return;
      }

      const entitlement = await prisma.entitlement.findUnique({
        where: { subscriptionId_featureCode: { subscriptionId: subscription.id, featureCode } },
      });

      if (!entitlement || !entitlement.isEnabled) {
        res
          .status(403)
          .json({ code: "FEATURE_NOT_INCLUDED", message: `Plan does not include: ${featureCode}` });
        return;
      }

      if (entitlement.quotaLimit !== null && entitlement.quotaUsed >= entitlement.quotaLimit) {
        res.status(403).json({ code: "QUOTA_EXCEEDED", message: `Quota exceeded for: ${featureCode}` });
        return;
      }

      next();
    })().catch(next);
  };
}
