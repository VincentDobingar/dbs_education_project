import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { requireVerifiedStudentRelationship } from "../../middleware/requireVerifiedStudentRelationship.js";

import * as parentPortalController from "./parent-portal.controller.js";

export const parentPortalRouter: Router = Router();

// §25 : le parent n'est jamais membre du tenant de l'enfant — requireVerifiedStudentRelationship
// (résolveur par défaut = req.params.studentId, d'où les chemins /children/:studentId/...)
// verrouille le tenant à celui de l'enfant, jamais enforceTenantScope/requireTenantMembership.
const verifiedChild = requireVerifiedStudentRelationship();

// Pas de :studentId ici — agrège tous les enfants vérifiés du parent, chacun sous
// son propre verrouillage de tenant (voir parent-portal.service.ts#getParentDashboard).
parentPortalRouter.get("/dashboard", requireAuth, parentPortalController.getDashboard);

parentPortalRouter.get(
  "/children/:studentId/attendance",
  requireAuth,
  verifiedChild,
  parentPortalController.getChildAttendance,
);
parentPortalRouter.get(
  "/children/:studentId/report-cards",
  requireAuth,
  verifiedChild,
  parentPortalController.getChildReportCards,
);
parentPortalRouter.get(
  "/children/:studentId/report-cards/:id",
  requireAuth,
  verifiedChild,
  parentPortalController.getChildReportCard,
);
parentPortalRouter.get(
  "/children/:studentId/report-cards/:id/pdf",
  requireAuth,
  verifiedChild,
  parentPortalController.getChildReportCardPdf,
);
parentPortalRouter.get(
  "/children/:studentId/timetable",
  requireAuth,
  verifiedChild,
  parentPortalController.getChildTimetable,
);
parentPortalRouter.get(
  "/children/:studentId/announcements",
  requireAuth,
  verifiedChild,
  parentPortalController.getChildAnnouncements,
);
parentPortalRouter.get(
  "/children/:studentId/homework",
  requireAuth,
  verifiedChild,
  parentPortalController.getChildHomework,
);
parentPortalRouter.get(
  "/children/:studentId/finance/situation",
  requireAuth,
  verifiedChild,
  parentPortalController.getChildFinancialSituation,
);
parentPortalRouter.get(
  "/children/:studentId/receipts/:receiptId/pdf",
  requireAuth,
  verifiedChild,
  parentPortalController.getChildReceiptPdf,
);
