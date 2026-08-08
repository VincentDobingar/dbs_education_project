import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";

import * as tenantController from "./tenant.controller.js";

export const tenantRouter: Router = Router();

// Deliberately NOT behind enforceTenantScope: there is no tenant to resolve yet —
// this is the endpoint that creates one (§14).
tenantRouter.post("/onboarding", requireAuth, tenantController.onboardTenant);
