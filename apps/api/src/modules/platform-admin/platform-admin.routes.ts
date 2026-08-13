import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePlatformRole } from "../../middleware/requirePlatformRole.js";

import * as auditLogController from "./audit-log.controller.js";
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
