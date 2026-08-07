import type { NextFunction, Request, Response } from "express";

import {
  findActiveSubscription,
  tenantOwnerContext,
  type SubscriptionOwnerContext,
} from "../lib/subscription-access.js";

type OwnerContextResolver = (req: Request) => SubscriptionOwnerContext | null;

/**
 * Defaults to checking the current tenant's own subscription (the common case for
 * school-side routes). Pass a resolver to check a parent's or student's individual
 * subscription instead, e.g. requireActiveSubscription((req) => ({ studentId: req.params.studentId })).
 */
export function requireActiveSubscription(resolveOwnerContext: OwnerContextResolver = tenantOwnerContext) {
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

      next();
    })().catch(next);
  };
}
