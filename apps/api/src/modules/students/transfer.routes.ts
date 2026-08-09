import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as transferController from "./transfer.controller.js";

// Top-level router (not nested under /students/:studentId): the destination
// tenant reviewing an incoming request has no access to the source tenant's
// Student record, so these routes are addressed by transfer id alone.
export const studentTransferRouter: Router = Router();

studentTransferRouter.use(requireAuth, enforceTenantScope, requireTenantMembership);

const manageStudents = requirePermission("students.write");

studentTransferRouter.post("/", manageStudents, transferController.requestTransfer);
studentTransferRouter.get("/", manageStudents, transferController.listTransfers);
studentTransferRouter.post("/:id/approve", manageStudents, transferController.approveTransfer);
studentTransferRouter.post("/:id/reject", manageStudents, transferController.rejectTransfer);
studentTransferRouter.post("/:id/complete", manageStudents, transferController.completeTransfer);
