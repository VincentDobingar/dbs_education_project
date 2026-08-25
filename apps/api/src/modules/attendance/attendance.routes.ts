import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireActiveSubscription } from "../../middleware/requireActiveSubscription.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as attendanceController from "./attendance.controller.js";

export const attendanceRouter: Router = Router();

attendanceRouter.use(requireAuth, enforceTenantScope, requireTenantMembership, requireActiveSubscription());

const readAttendance = requirePermission("attendance.read");
const writeAttendance = requirePermission("attendance.write");

attendanceRouter.put("/roll-call", writeAttendance, attendanceController.recordRollCall);
attendanceRouter.get("/", readAttendance, attendanceController.listAttendance);
attendanceRouter.patch("/:id/justify", writeAttendance, attendanceController.justifyAbsence);
