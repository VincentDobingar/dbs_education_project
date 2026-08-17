import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { requireLinkedStudent } from "../../middleware/requireLinkedStudent.js";

import * as studentPortalController from "./student-portal.controller.js";

export const studentPortalRouter: Router = Router();

// §26 : l'élève n'est jamais membre du tenant côté administration — requireLinkedStudent
// (résolveur par défaut = req.params.studentId, d'où les chemins /students/:studentId/...)
// verrouille le tenant à celui de son propre dossier, jamais enforceTenantScope/requireTenantMembership.
const linkedStudent = requireLinkedStudent();

studentPortalRouter.get(
  "/students/:studentId/dashboard",
  requireAuth,
  linkedStudent,
  studentPortalController.getDashboard,
);
studentPortalRouter.get(
  "/students/:studentId/profile",
  requireAuth,
  linkedStudent,
  studentPortalController.getProfile,
);
studentPortalRouter.get(
  "/students/:studentId/timetable",
  requireAuth,
  linkedStudent,
  studentPortalController.getTimetable,
);
studentPortalRouter.get(
  "/students/:studentId/report-cards",
  requireAuth,
  linkedStudent,
  studentPortalController.getReportCards,
);
studentPortalRouter.get(
  "/students/:studentId/report-cards/:id",
  requireAuth,
  linkedStudent,
  studentPortalController.getReportCard,
);
studentPortalRouter.get(
  "/students/:studentId/report-cards/:id/pdf",
  requireAuth,
  linkedStudent,
  studentPortalController.getReportCardPdf,
);
studentPortalRouter.get(
  "/students/:studentId/announcements",
  requireAuth,
  linkedStudent,
  studentPortalController.getAnnouncements,
);
studentPortalRouter.get(
  "/students/:studentId/receipts",
  requireAuth,
  linkedStudent,
  studentPortalController.getReceipts,
);
studentPortalRouter.get(
  "/students/:studentId/receipts/:receiptId/pdf",
  requireAuth,
  linkedStudent,
  studentPortalController.getReceiptPdf,
);
