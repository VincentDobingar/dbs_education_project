import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as activationController from "./activation-invitation.controller.js";
import * as relationshipController from "./parent-student-relationship.controller.js";

export const familyRouter: Router = Router();

const readStudents = requirePermission("students.read");
const writeStudents = requirePermission("students.write");

// Personnel de l'établissement : gère les invitations et les relations existantes,
// même chaîne que les autres modules tenant-scoped (§8, réutilise students.read/write).
familyRouter.post(
  "/invitations",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  writeStudents,
  activationController.createInvitation,
);
familyRouter.get(
  "/invitations",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  readStudents,
  activationController.listInvitations,
);
familyRouter.post(
  "/invitations/:id/revoke",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  writeStudents,
  activationController.revokeInvitation,
);

familyRouter.get(
  "/relationships",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  readStudents,
  relationshipController.listRelationships,
);
familyRouter.post(
  "/relationships/:id/revoke",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  writeStudents,
  relationshipController.revokeRelationship,
);

// Bénéficiaire (parent ou élève) : pas encore membre du tenant de l'enfant (§8, §9) —
// deliberately NOT behind enforceTenantScope, même raisonnement que
// tenant.routes.ts:onboarding.
familyRouter.post("/activation/redeem", requireAuth, activationController.redeemActivation);
familyRouter.get("/children", requireAuth, relationshipController.listMyChildren);
