import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireActiveSubscription } from "../../middleware/requireActiveSubscription.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as contractController from "./contract.controller.js";
import * as employeeDocumentController from "./employee-document.controller.js";
import * as employeeController from "./employee.controller.js";
import * as leaveRequestController from "./leave-request.controller.js";
import * as payrollExportController from "./payroll-export.controller.js";
import * as performanceEvaluationController from "./performance-evaluation.controller.js";
import * as staffAttendanceController from "./staff-attendance.controller.js";

export const employeeRouter: Router = Router();

employeeRouter.use(requireAuth, enforceTenantScope, requireTenantMembership, requireActiveSubscription());

const manageStaff = requirePermission("hr.manage");
// §27 : « les informations salariales doivent avoir des permissions particulièrement
// restrictives » — jamais couplées à manageStaff, même si les deux permissions sont
// aujourd'hui accordées aux mêmes rôles (SCHOOL_OWNER, HR_MANAGER).
const manageSalaryData = requirePermission("hr.salary.manage");

employeeRouter.post("/", manageStaff, employeeController.createEmployee);
employeeRouter.get("/", manageStaff, employeeController.listEmployees);
employeeRouter.get("/payroll/export.csv", manageSalaryData, payrollExportController.getPayrollExportCsv);
employeeRouter.get("/:id", manageStaff, employeeController.getEmployee);
employeeRouter.patch("/:id", manageStaff, employeeController.updateEmployee);
employeeRouter.post("/:id/archive", manageStaff, employeeController.archiveEmployee);
employeeRouter.get("/:id/workload", manageStaff, employeeController.getEmployeeWorkload);

employeeRouter.post("/:employeeId/contracts", manageSalaryData, contractController.createContract);
employeeRouter.get("/:employeeId/contracts", manageSalaryData, contractController.listContracts);
employeeRouter.patch("/:employeeId/contracts/:id", manageSalaryData, contractController.updateContract);

employeeRouter.post("/:employeeId/attendance", manageStaff, staffAttendanceController.recordStaffAttendance);
employeeRouter.get("/:employeeId/attendance", manageStaff, staffAttendanceController.listStaffAttendance);

employeeRouter.post("/:employeeId/leave-requests", manageStaff, leaveRequestController.createLeaveRequest);
employeeRouter.get("/:employeeId/leave-requests", manageStaff, leaveRequestController.listLeaveRequests);
employeeRouter.patch(
  "/:employeeId/leave-requests/:id/decision",
  manageStaff,
  leaveRequestController.decideLeaveRequest,
);

employeeRouter.post(
  "/:employeeId/evaluations",
  manageStaff,
  performanceEvaluationController.createPerformanceEvaluation,
);
employeeRouter.get(
  "/:employeeId/evaluations",
  manageStaff,
  performanceEvaluationController.listPerformanceEvaluations,
);

employeeRouter.post("/:employeeId/documents", manageStaff, employeeDocumentController.addEmployeeDocument);
employeeRouter.get("/:employeeId/documents", manageStaff, employeeDocumentController.listEmployeeDocuments);
employeeRouter.delete(
  "/:employeeId/documents/:id",
  manageStaff,
  employeeDocumentController.removeEmployeeDocument,
);
