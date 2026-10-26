import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { recordAuditLog } from "../../lib/audit-log.js";
import { AppError } from "../../lib/errors.js";
import * as paymentService from "../payments/payment.service.js";

import { resolveActor } from "./platform-actor.js";
import * as subscriptionAdminService from "./subscription-admin.service.js";
import {
  extendTrialSchema,
  listPlatformSubscriptionsQuerySchema,
  transitionSubscriptionSchema,
} from "./subscription-admin.validation.js";

export function listPlatformSubscriptions(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listPlatformSubscriptionsQuerySchema.parse(req.query);
    const subscriptions = await subscriptionAdminService.listPlatformSubscriptions(query);
    res.status(200).json(subscriptions);
  })().catch(next);
}

export function getPlatformSubscription(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const subscription = await subscriptionAdminService.requirePlatformSubscription(req.params.id as string);
    res.status(200).json(subscription);
  })().catch(next);
}

export function forceTransition(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = transitionSubscriptionSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification);
    const subscription = await subscriptionAdminService.forceTransition(
      req.params.id as string,
      input,
      actor,
    );
    res.status(200).json(subscription);
  })().catch(next);
}

export function extendTrial(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = extendTrialSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification);
    const subscription = await subscriptionAdminService.extendTrial(req.params.id as string, input, actor);
    res.status(200).json(subscription);
  })().catch(next);
}

export function sweepExpired(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const result = await subscriptionAdminService.sweepExpired();
    res.status(200).json(result);
  })().catch(next);
}

export function recordParentCashPayment(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = z
      .object({ paymentIntentId: z.string().min(1), justification: z.string().trim().min(1) })
      .parse(req.body);
    const subscription = await subscriptionAdminService.requirePlatformSubscription(req.params.id as string);
    if (subscription.owner.ownerType !== "PARENT")
      throw new AppError(400, "PARENT_SUBSCRIPTION_REQUIRED", "Abonnement parent requis");
    await paymentService.assertPaymentIntentBelongsToSubscription(input.paymentIntentId, subscription.id);
    const result = await paymentService.recordManualCashPayment({ paymentIntentId: input.paymentIntentId });
    const actor = await resolveActor(req, input.justification);
    await recordAuditLog({
      ...actor,
      action: "parent_subscription.cash_payment",
      entityType: "Subscription",
      entityId: subscription.id,
      afterData: { paymentIntentId: input.paymentIntentId },
    });
    res.json(result);
  })().catch(next);
}
