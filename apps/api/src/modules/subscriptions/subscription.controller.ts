import type { Subscription } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";
import * as paymentService from "../payments/payment.service.js";
import {
  createInvoiceSchema,
  createPaymentIntentSchema,
  recordCashPaymentSchema,
} from "../payments/payment.validation.js";

import * as subscriptionService from "./subscription.service.js";
import { cancelSubscriptionSchema, createSchoolSubscriptionSchema } from "./subscription.validation.js";

function requireTenantId(req: Request): string {
  if (!req.tenant) {
    throw new AppError(400, "TENANT_REQUIRED", "This route must be called on a tenant subdomain");
  }
  return req.tenant.id;
}

/** Always resolves the subscription BY tenant, never by a client-supplied id —
 * a tenant admin must never be able to reach another tenant's subscription by
 * guessing its id in the URL. */
async function requireTenantSubscription(tenantId: string): Promise<Subscription> {
  const subscription = await subscriptionService.findSubscriptionForOwner({ tenantId });

  if (!subscription) {
    throw new AppError(404, "NO_SUBSCRIPTION", "This tenant has no subscription yet");
  }

  return subscription;
}

export function createSchoolSubscription(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const tenantId = requireTenantId(req);
    const input = createSchoolSubscriptionSchema.parse(req.body);

    const subscription = await subscriptionService.createDraftSubscription({
      ownerType: "SCHOOL",
      ownerRef: { tenantId },
      planCode: input.planCode,
      fundingSource: "SELF_PAID",
      billingPeriod: input.billingPeriod,
    });

    res.status(201).json(subscription);
  })().catch(next);
}

export function getSchoolSubscription(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const tenantId = requireTenantId(req);
    const subscription = await requireTenantSubscription(tenantId);
    res.status(200).json(subscription);
  })().catch(next);
}

export function cancelSchoolSubscription(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const tenantId = requireTenantId(req);
    const input = cancelSubscriptionSchema.parse(req.body);
    const subscription = await requireTenantSubscription(tenantId);

    if (subscription.id !== req.params.id) {
      res
        .status(404)
        .json({ code: "SUBSCRIPTION_NOT_FOUND", message: "Subscription not found for this tenant" });
      return;
    }

    const updated = await subscriptionService.transitionSubscription(subscription.id, "CANCELLED", {
      ...(input.reason ? { reason: input.reason } : {}),
      ...(req.user ? { actorUserId: req.user.id } : {}),
    });

    res.status(200).json(updated);
  })().catch(next);
}

export function createSchoolInvoice(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const tenantId = requireTenantId(req);
    const input = createInvoiceSchema.parse(req.body);
    const subscription = await requireTenantSubscription(tenantId);

    const invoice = await paymentService.createInvoiceForSubscription({
      subscriptionId: subscription.id,
      currencyIsoCode: input.currencyIsoCode,
      billingName: input.billingName,
      billingEmail: input.billingEmail,
      ...(input.countryIsoCode ? { countryIsoCode: input.countryIsoCode } : {}),
    });

    res.status(201).json(invoice);
  })().catch(next);
}

export function createSchoolPaymentIntent(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const tenantId = requireTenantId(req);
    const input = createPaymentIntentSchema.parse(req.body);
    const subscription = await requireTenantSubscription(tenantId);

    await paymentService.assertInvoiceBelongsToSubscription(input.invoiceId, subscription.id);

    const intent = await paymentService.createPaymentIntent({
      invoiceId: input.invoiceId,
      providerCode: input.providerCode,
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    });

    res.status(201).json(intent);
  })().catch(next);
}

export function recordSchoolCashPayment(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const tenantId = requireTenantId(req);
    const input = recordCashPaymentSchema.parse(req.body);
    const subscription = await requireTenantSubscription(tenantId);

    await paymentService.assertPaymentIntentBelongsToSubscription(input.paymentIntentId, subscription.id);

    const transaction = await paymentService.recordManualCashPayment({
      paymentIntentId: input.paymentIntentId,
    });

    res.status(200).json(transaction);
  })().catch(next);
}
