import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as subscriptionController from "./subscription.controller.js";

export const subscriptionRouter: Router = Router();

// School subscriptions live on the tenant's own subdomain — self-service by
// tenant staff, never a platform admin acting on their behalf implicitly.
subscriptionRouter.post(
  "/school",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  requirePermission("subscriptions.manage"),
  subscriptionController.createSchoolSubscription,
);

subscriptionRouter.get(
  "/school",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  subscriptionController.getSchoolSubscription,
);

subscriptionRouter.post(
  "/school/:id/cancel",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  requirePermission("subscriptions.manage"),
  subscriptionController.cancelSchoolSubscription,
);

subscriptionRouter.post(
  "/school/invoice",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  requirePermission("subscriptions.manage"),
  subscriptionController.createSchoolInvoice,
);

subscriptionRouter.post(
  "/school/payment-intent",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  requirePermission("subscriptions.manage"),
  subscriptionController.createSchoolPaymentIntent,
);

// Recording the actual cash receipt is a finance/accounting action, deliberately
// gated by a different permission than deciding to buy/upgrade a plan (§27
// separation of duties).
subscriptionRouter.post(
  "/school/cash-payment",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  requirePermission("finance.write"),
  subscriptionController.recordSchoolCashPayment,
);
