import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePlatformRole } from "../../middleware/requirePlatformRole.js";

import * as auditLogController from "./audit-log.controller.js";
import * as licenseAdminController from "./license-admin.controller.js";
import * as messageTemplateAdminController from "./message-template-admin.controller.js";
import * as organizationAdminController from "./organization-admin.controller.js";
import * as platformSettingAdminController from "./platform-setting-admin.controller.js";
import * as promotionCodeAdminController from "./promotion-code-admin.controller.js";
import * as referenceDataAdminController from "./reference-data-admin.controller.js";
import * as statsAdminController from "./stats-admin.controller.js";
import * as subscriptionAdminController from "./subscription-admin.controller.js";
import * as supportTicketAdminController from "./support-ticket-admin.controller.js";
import * as tenantAdminController from "./tenant-admin.controller.js";

export const platformAdminRouter: Router = Router();

// §31 : jamais enforceTenantScope/requireTenantMembership — une action cross-tenant
// par nature, gardée par le rôle plateforme de l'appelant plutôt qu'une appartenance
// à un tenant précis.
const readPlatform = requirePlatformRole("SUPER_ADMIN", "PLATFORM_ADMIN", "PLATFORM_AUDITOR");
const managePlatform = requirePlatformRole("SUPER_ADMIN", "PLATFORM_ADMIN");

// Tickets de support : le seed (prisma/seed/data/roles-permissions.ts) n'accorde la
// permission platform.support.manage qu'à SUPER_ADMIN et SUPPORT_AGENT (pas
// PLATFORM_ADMIN) — gardes dédiées plutôt que readPlatform/managePlatform pour
// respecter cette intention.
const readPlatformSupport = requirePlatformRole(
  "SUPER_ADMIN",
  "PLATFORM_ADMIN",
  "PLATFORM_AUDITOR",
  "SUPPORT_AGENT",
);
const manageSupportTickets = requirePlatformRole("SUPER_ADMIN", "SUPPORT_AGENT");

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

platformAdminRouter.get(
  "/promotion-codes",
  requireAuth,
  readPlatform,
  promotionCodeAdminController.listPromotionCodes,
);
platformAdminRouter.post(
  "/promotion-codes",
  requireAuth,
  managePlatform,
  promotionCodeAdminController.createPromotionCode,
);
platformAdminRouter.patch(
  "/promotion-codes/:id",
  requireAuth,
  managePlatform,
  promotionCodeAdminController.updatePromotionCode,
);

platformAdminRouter.get(
  "/support-tickets",
  requireAuth,
  readPlatformSupport,
  supportTicketAdminController.listSupportTickets,
);
platformAdminRouter.get(
  "/support-tickets/:id",
  requireAuth,
  readPlatformSupport,
  supportTicketAdminController.getSupportTicket,
);
platformAdminRouter.post(
  "/support-tickets/:id/assign",
  requireAuth,
  manageSupportTickets,
  supportTicketAdminController.assignSupportTicket,
);
platformAdminRouter.patch(
  "/support-tickets/:id/status",
  requireAuth,
  manageSupportTickets,
  supportTicketAdminController.updateSupportTicketStatus,
);
platformAdminRouter.post(
  "/support-tickets/:id/messages",
  requireAuth,
  manageSupportTickets,
  supportTicketAdminController.addSupportTicketMessage,
);

platformAdminRouter.get(
  "/message-templates",
  requireAuth,
  readPlatform,
  messageTemplateAdminController.listMessageTemplates,
);
platformAdminRouter.post(
  "/message-templates",
  requireAuth,
  managePlatform,
  messageTemplateAdminController.createMessageTemplate,
);
platformAdminRouter.patch(
  "/message-templates/:id",
  requireAuth,
  managePlatform,
  messageTemplateAdminController.updateMessageTemplate,
);
platformAdminRouter.delete(
  "/message-templates/:id",
  requireAuth,
  managePlatform,
  messageTemplateAdminController.deleteMessageTemplate,
);

platformAdminRouter.get(
  "/organizations",
  requireAuth,
  readPlatform,
  organizationAdminController.listOrganizations,
);
platformAdminRouter.post(
  "/organizations",
  requireAuth,
  managePlatform,
  organizationAdminController.createOrganization,
);
platformAdminRouter.patch(
  "/organizations/:id",
  requireAuth,
  managePlatform,
  organizationAdminController.updateOrganization,
);
platformAdminRouter.delete(
  "/organizations/:id",
  requireAuth,
  managePlatform,
  organizationAdminController.deleteOrganization,
);

platformAdminRouter.get(
  "/license-batches",
  requireAuth,
  readPlatform,
  licenseAdminController.listLicenseBatches,
);
platformAdminRouter.get(
  "/license-batches/:id",
  requireAuth,
  readPlatform,
  licenseAdminController.getLicenseBatch,
);
platformAdminRouter.post(
  "/license-batches",
  requireAuth,
  managePlatform,
  licenseAdminController.createLicenseBatch,
);

platformAdminRouter.get("/licenses", requireAuth, readPlatform, licenseAdminController.listLicenses);
platformAdminRouter.get("/licenses/:id", requireAuth, readPlatform, licenseAdminController.getLicense);
platformAdminRouter.post(
  "/licenses/:id/assign",
  requireAuth,
  managePlatform,
  licenseAdminController.assignLicense,
);
platformAdminRouter.post(
  "/licenses/:id/revoke",
  requireAuth,
  managePlatform,
  licenseAdminController.revokeLicense,
);

platformAdminRouter.get("/stats/overview", requireAuth, readPlatform, statsAdminController.getStatsOverview);

platformAdminRouter.get(
  "/platform-settings",
  requireAuth,
  readPlatform,
  platformSettingAdminController.listPlatformSettings,
);
platformAdminRouter.get(
  "/platform-settings/:key",
  requireAuth,
  readPlatform,
  platformSettingAdminController.getPlatformSetting,
);
platformAdminRouter.put(
  "/platform-settings/:key",
  requireAuth,
  managePlatform,
  platformSettingAdminController.upsertPlatformSetting,
);
platformAdminRouter.delete(
  "/platform-settings/:key",
  requireAuth,
  managePlatform,
  platformSettingAdminController.deletePlatformSetting,
);
