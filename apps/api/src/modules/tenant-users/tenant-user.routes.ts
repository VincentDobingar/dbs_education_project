import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireActiveSubscription } from "../../middleware/requireActiveSubscription.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as tenantUserController from "./tenant-user.controller.js";

export const tenantUserRouter: Router = Router();

// Managing who belongs to a tenant and which roles they hold is a settings-level
// action (§17) — same permission that gates the rest of school configuration.
tenantUserRouter.use(requireAuth, enforceTenantScope, requireTenantMembership, requireActiveSubscription());

const manageUsers = requirePermission("tenant.settings.manage");

tenantUserRouter.post("/", manageUsers, tenantUserController.inviteTenantUser);
tenantUserRouter.get("/", manageUsers, tenantUserController.listTenantUsers);
tenantUserRouter.post("/:userId/roles", manageUsers, tenantUserController.grantRole);
tenantUserRouter.delete("/:userId/roles/:roleCode", manageUsers, tenantUserController.revokeRole);
tenantUserRouter.patch("/:userId/status", manageUsers, tenantUserController.updateMembershipStatus);
