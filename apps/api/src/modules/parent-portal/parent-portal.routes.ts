import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";
import { requireEntitlement } from "../../middleware/requireEntitlement.js";
import { parentCoverageOwnerContext, requireParentCoverage } from "../../middleware/requireParentCoverage.js";
import { requireVerifiedStudentRelationship } from "../../middleware/requireVerifiedStudentRelationship.js";
import * as publication from "../elearning/course-publication.controller.js";
import { getTimetableBreaks } from "../school-config/timetable-breaks.service.js";
import { getGrades, getIncidents } from "../student-portal/student-portal.controller.js";

import * as parentPortalController from "./parent-portal.controller.js";

export const parentPortalRouter: Router = Router();

// §25 : le parent n'est jamais membre du tenant de l'enfant — requireVerifiedStudentRelationship
// (résolveur par défaut = req.params.studentId, d'où les chemins /children/:studentId/...)
// verrouille le tenant à celui de l'enfant, jamais enforceTenantScope/requireTenantMembership.
const verifiedChild = requireVerifiedStudentRelationship();

// Relation vérifiée d'abord, couverture explicite enfant/établissement ensuite.
// Un abonnement familial couvre uniquement ses enfants sélectionnés ; le quota
// PDF est décompté sur l'abonnement exact qui couvre l'enfant demandé.
const requireFamilySubscription = requireParentCoverage;
parentPortalRouter.get(
  "/children/:studentId/timetable-breaks",
  requireAuth,
  verifiedChild,
  requireFamilySubscription,
  (_req, res, next) => {
    void getTimetableBreaks()
      .then((data) => res.json(data))
      .catch(next);
  },
);
parentPortalRouter.get(
  "/children/:studentId/courses",
  requireAuth,
  verifiedChild,
  requireFamilySubscription,
  publication.familyCourses,
);
parentPortalRouter.get(
  "/children/:studentId/courses/:courseId",
  requireAuth,
  verifiedChild,
  requireFamilySubscription,
  publication.familyCourse,
);
parentPortalRouter.get(
  "/children/:studentId/courses/:courseId/resources/:resourceId/file",
  requireAuth,
  verifiedChild,
  requireFamilySubscription,
  publication.familyPdf,
);

// La coque reste accessible pour souscrire ; le service exclut tout enfant sans
// couverture ACTIVE avant de charger ses données scolaires ou financières.
parentPortalRouter.get("/dashboard", requireAuth, parentPortalController.getDashboard);
parentPortalRouter.get(
  "/children/:studentId/grades",
  requireAuth,
  verifiedChild,
  requireFamilySubscription,
  getGrades,
);
parentPortalRouter.get(
  "/children/:studentId/incidents",
  requireAuth,
  verifiedChild,
  requireFamilySubscription,
  getIncidents,
);
parentPortalRouter.get(
  "/children/:studentId/access",
  requireAuth,
  verifiedChild,
  requireFamilySubscription,
  (_req, res) => {
    res.json({ allowed: true });
  },
);

parentPortalRouter.get(
  "/children/:studentId/attendance",
  requireAuth,
  verifiedChild,
  requireFamilySubscription,
  parentPortalController.getChildAttendance,
);
parentPortalRouter.get(
  "/children/:studentId/report-cards",
  requireAuth,
  verifiedChild,
  requireFamilySubscription,
  parentPortalController.getChildReportCards,
);
parentPortalRouter.get(
  "/children/:studentId/report-cards/:id",
  requireAuth,
  verifiedChild,
  requireFamilySubscription,
  parentPortalController.getChildReportCard,
);
parentPortalRouter.get(
  "/children/:studentId/report-cards/:id/pdf",
  requireAuth,
  verifiedChild,
  // §37 quotas : entitlement dédié plutôt que requireFamilySubscription seul — le
  // téléchargement d'un bulletin en PDF est la seule action de ce module déjà
  // dimensionnée avec un quota au seed (plan-features.ts, "report_card.download").
  requireFamilySubscription,
  requireEntitlement("report_card.download", parentCoverageOwnerContext),
  parentPortalController.getChildReportCardPdf,
);
parentPortalRouter.get(
  "/children/:studentId/timetable",
  requireAuth,
  verifiedChild,
  requireFamilySubscription,
  parentPortalController.getChildTimetable,
);
parentPortalRouter.get(
  "/children/:studentId/announcements",
  requireAuth,
  verifiedChild,
  requireFamilySubscription,
  parentPortalController.getChildAnnouncements,
);
parentPortalRouter.get(
  "/children/:studentId/homework",
  requireAuth,
  verifiedChild,
  requireFamilySubscription,
  parentPortalController.getChildHomework,
);
parentPortalRouter.get(
  "/children/:studentId/finance/situation",
  requireAuth,
  verifiedChild,
  requireFamilySubscription,
  parentPortalController.getChildFinancialSituation,
);
parentPortalRouter.get(
  "/children/:studentId/receipts",
  requireAuth,
  verifiedChild,
  requireFamilySubscription,
  parentPortalController.getChildReceipts,
);
parentPortalRouter.get(
  "/children/:studentId/receipts/:receiptId/pdf",
  requireAuth,
  verifiedChild,
  requireFamilySubscription,
  parentPortalController.getChildReceiptPdf,
);

parentPortalRouter.get(
  "/children/:studentId/invoices/:invoiceId/pdf",
  requireAuth,
  verifiedChild,
  requireFamilySubscription,
  parentPortalController.getChildInvoicePdf,
);

parentPortalRouter.get(
  "/children/:studentId/id-card",
  requireAuth,
  verifiedChild,
  requireFamilySubscription,
  parentPortalController.getIdCardPdf,
);
