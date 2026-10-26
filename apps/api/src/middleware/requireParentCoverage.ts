import type { NextFunction, Request, Response } from "express";

import { rawPrisma } from "../lib/prisma.js";
import { findCoveredParentSubscription } from "../modules/parent-portal/parent-subscription.service.js";

export async function parentCoverageOwnerContext(req: Request) {
  if (!req.user || !req.tenant || typeof req.params.studentId !== "string") return null;
  const subscription = await findCoveredParentSubscription(req.user.id, req.params.studentId, req.tenant.id);
  if (!subscription) return null;
  // Le propriétaire est vérifié par findCoveredParentSubscription ; filtre exact
  // conservé pour que les quotas correspondent à CET abonnement et non au dernier du foyer.
  const owner = await rawPrisma.subscriptionOwner.findUniqueOrThrow({ where: { id: subscription.ownerId } });
  return { familyAccountId: owner.familyAccountId!, subscriptionId: subscription.id };
}
export function requireParentCoverage(req: Request, res: Response, next: NextFunction): void {
  void parentCoverageOwnerContext(req)
    .then((context) => {
      if (!context) {
        res.status(402).json({
          code: "SUBSCRIPTION_INACTIVE",
          message: "Aucun abonnement actif ne couvre cet enfant dans cet établissement",
        });
        return;
      }
      next();
    })
    .catch(next);
}
