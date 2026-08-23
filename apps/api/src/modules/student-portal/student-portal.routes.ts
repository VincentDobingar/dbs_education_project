import { Router } from "express";

import { studentOwnerContext } from "../../lib/subscription-access.js";
import { requireActiveSubscription } from "../../middleware/requireActiveSubscription.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireEntitlement } from "../../middleware/requireEntitlement.js";
import { requireLinkedStudent } from "../../middleware/requireLinkedStudent.js";

import * as studentPortalController from "./student-portal.controller.js";

export const studentPortalRouter: Router = Router();

// §26 : l'élève n'est jamais membre du tenant côté administration — requireLinkedStudent
// (résolveur par défaut = req.params.studentId, d'où les chemins /students/:studentId/...)
// verrouille le tenant à celui de son propre dossier, jamais enforceTenantScope/requireTenantMembership.
const linkedStudent = requireLinkedStudent();

// §37 : « un élève non abonné ne peut pas consulter les fonctions protégées ».
// Placé APRÈS linkedStudent sur chaque route ci-dessous (jamais avant) : un étranger
// sans lien vérifié reste bloqué par le 403 de vérification de lien, jamais un 402
// d'abonnement qui confirmerait au passage l'existence d'un abonnement pour ce compte.
const requireStudentSubscription = requireActiveSubscription(studentOwnerContext);

studentPortalRouter.get(
  // Volontairement JAMAIS derrière requireStudentSubscription : ce tableau de bord
  // doit rester consultable même sans abonnement (il affiche `subscription: null`
  // dans ce cas, jamais un abonnement fabriqué) — un aperçu, pas une fonction
  // protégée au sens de §37.
  "/students/:studentId/dashboard",
  requireAuth,
  linkedStudent,
  studentPortalController.getDashboard,
);
studentPortalRouter.get(
  "/students/:studentId/profile",
  requireAuth,
  linkedStudent,
  requireStudentSubscription,
  studentPortalController.getProfile,
);
studentPortalRouter.get(
  "/students/:studentId/timetable",
  requireAuth,
  linkedStudent,
  requireStudentSubscription,
  studentPortalController.getTimetable,
);
studentPortalRouter.get(
  "/students/:studentId/report-cards",
  requireAuth,
  linkedStudent,
  requireStudentSubscription,
  studentPortalController.getReportCards,
);
studentPortalRouter.get(
  "/students/:studentId/report-cards/:id",
  requireAuth,
  linkedStudent,
  requireStudentSubscription,
  studentPortalController.getReportCard,
);
studentPortalRouter.get(
  "/students/:studentId/report-cards/:id/pdf",
  requireAuth,
  linkedStudent,
  // §37 quotas : entitlement dédié, même raisonnement que le portail parent — seule
  // action de ce module déjà dimensionnée avec un quota au seed ("report_card.download").
  requireEntitlement("report_card.download", studentOwnerContext),
  studentPortalController.getReportCardPdf,
);
studentPortalRouter.get(
  "/students/:studentId/announcements",
  requireAuth,
  linkedStudent,
  requireStudentSubscription,
  studentPortalController.getAnnouncements,
);
studentPortalRouter.get(
  "/students/:studentId/receipts",
  requireAuth,
  linkedStudent,
  requireStudentSubscription,
  studentPortalController.getReceipts,
);
studentPortalRouter.get(
  "/students/:studentId/receipts/:receiptId/pdf",
  requireAuth,
  linkedStudent,
  requireStudentSubscription,
  studentPortalController.getReceiptPdf,
);
