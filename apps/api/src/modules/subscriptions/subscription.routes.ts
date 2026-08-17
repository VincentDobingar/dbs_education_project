import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireLinkedStudent } from "../../middleware/requireLinkedStudent.js";
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

// §9 : abonnement familial en libre-service — le parent n'est membre d'aucun
// tenant, jamais enforceTenantScope/requireTenantMembership (même raisonnement
// que /school ci-dessus, résolu par familyAccountId plutôt que tenantId).
subscriptionRouter.post("/family", requireAuth, subscriptionController.createFamilySubscription);
subscriptionRouter.get("/family", requireAuth, subscriptionController.getFamilySubscription);
subscriptionRouter.post("/family/:id/cancel", requireAuth, subscriptionController.cancelFamilySubscription);
subscriptionRouter.post("/family/invoice", requireAuth, subscriptionController.createFamilyInvoice);
subscriptionRouter.post(
  "/family/payment-intent",
  requireAuth,
  subscriptionController.createFamilyPaymentIntent,
);
subscriptionRouter.post("/family/cash-payment", requireAuth, subscriptionController.recordFamilyCashPayment);

// §26 : abonnement individuel de l'élève — même raisonnement que /family (jamais
// enforceTenantScope/requireTenantMembership, l'élève n'est pas membre du tenant
// côté staff), résolu par studentId via requireLinkedStudent plutôt que
// requireFamilyAccountForUser (un même User peut être lié à plusieurs Student au
// fil des transferts, §10 — d'où le paramètre explicite plutôt qu'une résolution
// implicite "mon unique compte").
const linkedStudentForSubscription = requireLinkedStudent();

subscriptionRouter.post(
  "/student/:studentId",
  requireAuth,
  linkedStudentForSubscription,
  subscriptionController.createStudentSubscription,
);
subscriptionRouter.get(
  "/student/:studentId",
  requireAuth,
  linkedStudentForSubscription,
  subscriptionController.getStudentSubscription,
);
subscriptionRouter.post(
  "/student/:studentId/:id/cancel",
  requireAuth,
  linkedStudentForSubscription,
  subscriptionController.cancelStudentSubscription,
);
subscriptionRouter.post(
  "/student/:studentId/invoice",
  requireAuth,
  linkedStudentForSubscription,
  subscriptionController.createStudentInvoice,
);
subscriptionRouter.post(
  "/student/:studentId/payment-intent",
  requireAuth,
  linkedStudentForSubscription,
  subscriptionController.createStudentPaymentIntent,
);
subscriptionRouter.post(
  "/student/:studentId/cash-payment",
  requireAuth,
  linkedStudentForSubscription,
  subscriptionController.recordStudentCashPayment,
);
