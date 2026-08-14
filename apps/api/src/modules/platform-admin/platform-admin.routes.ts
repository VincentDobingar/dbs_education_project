import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePlatformRole } from "../../middleware/requirePlatformRole.js";

import * as auditLogController from "./audit-log.controller.js";
import * as referenceDataAdminController from "./reference-data-admin.controller.js";
import * as subscriptionAdminController from "./subscription-admin.controller.js";
import * as tenantAdminController from "./tenant-admin.controller.js";

export const platformAdminRouter: Router = Router();

// §31 : jamais enforceTenantScope/requireTenantMembership — une action cross-tenant
// par nature, gardée par le rôle plateforme de l'appelant plutôt qu'une appartenance
// à un tenant précis.
const readPlatform = requirePlatformRole("SUPER_ADMIN", "PLATFORM_ADMIN", "PLATFORM_AUDITOR");
const managePlatform = requirePlatformRole("SUPER_ADMIN", "PLATFORM_ADMIN");

platformAdminRouter.get("/tenants", requireAuth, readPlatform, tenantAdminController.listPlatformTenants);
platformAdminRouter.get("/tenants/:id", requireAuth, readPlatform, tenantAdminController.getPlatformTenant);
platformAdminRouter.post(
  "/tenants/:id/verify",
  requireAuth,
  managePlatform,
  tenantAdminController.verifyTenant,
);
platformAdminRouter.post(
  "/tenants/:id/reject",
  requireAuth,
  managePlatform,
  tenantAdminController.rejectTenant,
);
platformAdminRouter.post(
  "/tenants/:id/suspend",
  requireAuth,
  managePlatform,
  tenantAdminController.suspendTenant,
);
platformAdminRouter.post(
  "/tenants/:id/reactivate",
  requireAuth,
  managePlatform,
  tenantAdminController.reactivateTenant,
);

platformAdminRouter.get("/audit-logs", requireAuth, readPlatform, auditLogController.listAuditLogs);

platformAdminRouter.get(
  "/subscriptions",
  requireAuth,
  readPlatform,
  subscriptionAdminController.listPlatformSubscriptions,
);
platformAdminRouter.get(
  "/subscriptions/:id",
  requireAuth,
  readPlatform,
  subscriptionAdminController.getPlatformSubscription,
);
platformAdminRouter.post(
  "/subscriptions/:id/transition",
  requireAuth,
  managePlatform,
  subscriptionAdminController.forceTransition,
);
platformAdminRouter.post(
  "/subscriptions/:id/extend-trial",
  requireAuth,
  managePlatform,
  subscriptionAdminController.extendTrial,
);

platformAdminRouter.get("/countries", requireAuth, readPlatform, referenceDataAdminController.listCountries);
platformAdminRouter.post(
  "/countries",
  requireAuth,
  managePlatform,
  referenceDataAdminController.createCountry,
);
platformAdminRouter.patch(
  "/countries/:id",
  requireAuth,
  managePlatform,
  referenceDataAdminController.updateCountry,
);

platformAdminRouter.get(
  "/currencies",
  requireAuth,
  readPlatform,
  referenceDataAdminController.listCurrencies,
);
platformAdminRouter.post(
  "/currencies",
  requireAuth,
  managePlatform,
  referenceDataAdminController.createCurrency,
);
platformAdminRouter.patch(
  "/currencies/:id",
  requireAuth,
  managePlatform,
  referenceDataAdminController.updateCurrency,
);

platformAdminRouter.get(
  "/payment-providers",
  requireAuth,
  readPlatform,
  referenceDataAdminController.listPaymentProviders,
);
platformAdminRouter.post(
  "/payment-providers",
  requireAuth,
  managePlatform,
  referenceDataAdminController.createPaymentProvider,
);
platformAdminRouter.patch(
  "/payment-providers/:id",
  requireAuth,
  managePlatform,
  referenceDataAdminController.updatePaymentProvider,
);
