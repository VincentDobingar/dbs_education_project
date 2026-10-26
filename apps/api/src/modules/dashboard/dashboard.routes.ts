import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireActiveSubscription } from "../../middleware/requireActiveSubscription.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as dashboardController from "./dashboard.controller.js";
import * as teacherWorkspace from "./teacher-workspace.controller.js";

export const dashboardRouter: Router = Router();

dashboardRouter.use(requireAuth, enforceTenantScope, requireTenantMembership, requireActiveSubscription());

// §18 : "Direction" combine finances + discipline — finance.read (SCHOOL_OWNER,
// SCHOOL_ADMIN, DIRECTOR, ACCOUNTANT, TENANT_AUDITOR) seul laisserait un comptable
// y accéder (il a déjà son propre tableau de bord ci-dessous) ; discipline.read en
// plus (absent du rôle ACCOUNTANT) restreint exactement à la direction/l'audit.
dashboardRouter.get(
  "/direction",
  requirePermission("finance.read"),
  requirePermission("discipline.read"),
  dashboardController.getDirectionDashboard,
);

dashboardRouter.get(
  "/comptable",
  requirePermission("finance.read"),
  dashboardController.getAccountantDashboard,
);

// Auto-scopé par l'Employee lié à l'appelant (§18 "Enseignant") — attendance.read
// est le plus largement détenu par les rôles encadrants/enseignants ; le contenu
// reste vide/EMPLOYEE_RECORD_REQUIRED pour quiconque n'a pas de fiche employé liée.
dashboardRouter.get(
  "/enseignant",
  requirePermission("attendance.read"),
  dashboardController.getTeacherDashboard,
);

dashboardRouter.get(
  "/enseignant/workspace",
  requirePermission("attendance.read"),
  teacherWorkspace.workspace,
);
dashboardRouter.get(
  "/enseignant/assignments/:assignmentId",
  requirePermission("attendance.read"),
  teacherWorkspace.classroomWorkspace,
);
dashboardRouter.post(
  "/enseignant/assignments/:assignmentId/attendance",
  requirePermission("attendance.write"),
  teacherWorkspace.saveAttendance,
);
dashboardRouter.get(
  "/enseignant/assignments/:assignmentId/assessments/:assessmentId/grades",
  requirePermission("grades.read"),
  teacherWorkspace.assessmentGrades,
);
dashboardRouter.put(
  "/enseignant/assignments/:assignmentId/assessments/:assessmentId/grades",
  requirePermission("grades.write"),
  teacherWorkspace.saveGrades,
);
dashboardRouter.post(
  "/enseignant/assignments/:assignmentId/assessments",
  requirePermission("grades.write"),
  teacherWorkspace.newAssessment,
);

dashboardRouter.get(
  "/enseignant/assignments/:assignmentId/attendance",
  requirePermission("attendance.read"),
  teacherWorkspace.getAttendanceForAssignment,
);
