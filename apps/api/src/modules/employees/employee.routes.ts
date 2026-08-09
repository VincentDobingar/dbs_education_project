import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as employeeController from "./employee.controller.js";

export const employeeRouter: Router = Router();

employeeRouter.use(requireAuth, enforceTenantScope, requireTenantMembership);

const manageStaff = requirePermission("hr.manage");

employeeRouter.post("/", manageStaff, employeeController.createEmployee);
employeeRouter.get("/", manageStaff, employeeController.listEmployees);
employeeRouter.get("/:id", manageStaff, employeeController.getEmployee);
employeeRouter.patch("/:id", manageStaff, employeeController.updateEmployee);
employeeRouter.post("/:id/archive", manageStaff, employeeController.archiveEmployee);
