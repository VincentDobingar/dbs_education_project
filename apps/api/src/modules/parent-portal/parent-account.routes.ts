import { Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import { AppError } from "../../lib/errors.js";
import { rawPrisma } from "../../lib/prisma.js";
import { buildRateLimiter } from "../../middleware/rateLimit.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import * as subscriptionController from "../subscriptions/subscription.controller.js";

import * as profiles from "./parent-profile.service.js";
import * as subscriptions from "./parent-subscription.service.js";

export const parentAccountRouter: Router = Router();
parentAccountRouter.use(requireAuth);
parentAccountRouter.use((_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  next();
});
const contactRequests = buildRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => `parent-contact-start:${req.user!.id}`,
});
const contactAttempts = buildRateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => `parent-contact-confirm:${req.user!.id}`,
});
function action(fn: (req: Request, res: Response, userId: string) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req, res, req.user!.id).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        next(
          new AppError(
            409,
            "PARENT_RECORD_CONFLICT",
            "Cette couverture ou ces coordonnées sont déjà utilisées",
          ),
        );
      else next(error);
    });
  };
}
parentAccountRouter.get(
  "/profile",
  action(async (_req, res, id) => res.json(await profiles.getParentProfile(id))),
);
parentAccountRouter.patch(
  "/profile",
  action(async (req, res, id) =>
    res.json(await profiles.updateParentProfile(id, profiles.parentProfileSchema.parse(req.body))),
  ),
);
parentAccountRouter.post(
  "/profile/contact-changes",
  contactRequests,
  action(async (req, res, id) =>
    res
      .status(201)
      .json(await profiles.requestContactChange(id, profiles.contactChangeSchema.parse(req.body))),
  ),
);
parentAccountRouter.post(
  "/profile/contact-changes/:id/confirm",
  contactAttempts,
  action(async (req, res, id) => {
    const input = z
      .object({ code: z.string().regex(/^\d{6}$/) })
      .strict()
      .parse(req.body);
    return res.json(await profiles.confirmContactChange(id, req.params.id as string, input.code));
  }),
);
parentAccountRouter.get(
  "/coverage-options",
  action(async (_req, res, id) => res.json(await subscriptions.listCoverageOptions(id))),
);
parentAccountRouter.get(
  "/plans",
  action(async (_req, res) =>
    res.json(
      await rawPrisma.subscriptionPlan.findMany({
        where: { category: "PARENT", isActive: true },
        select: { code: true, nameFr: true, childrenCovered: true },
      }),
    ),
  ),
);
parentAccountRouter.get(
  "/subscriptions",
  action(async (_req, res, id) => res.json(await subscriptions.listParentSubscriptions(id))),
);
parentAccountRouter.post(
  "/subscriptions",
  action(async (req, res, id) =>
    res
      .status(201)
      .json(
        await subscriptions.createParentSubscription(
          id,
          subscriptions.parentSubscriptionSchema.parse(req.body),
        ),
      ),
  ),
);
parentAccountRouter.post(
  "/subscriptions/:id/coverage",
  action(async (req, res, id) =>
    res.json(
      await subscriptions.attachParentCoverage(
        id,
        req.params.id as string,
        subscriptions.coverageSelectionSchema.parse(req.body).children,
      ),
    ),
  ),
);
parentAccountRouter.post("/subscriptions/:id/invoice", subscriptionController.createFamilyInvoice);
parentAccountRouter.post(
  "/subscriptions/:id/payment-intent",
  subscriptionController.createFamilyPaymentIntent,
);
parentAccountRouter.post("/subscriptions/:id/cancel", subscriptionController.cancelFamilySubscription);
