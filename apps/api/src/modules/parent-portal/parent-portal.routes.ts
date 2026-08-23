import { Router } from "express";

import { familyAccountOwnerContext } from "../../lib/subscription-access.js";
import { requireActiveSubscription } from "../../middleware/requireActiveSubscription.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireEntitlement } from "../../middleware/requireEntitlement.js";
import { requireVerifiedStudentRelationship } from "../../middleware/requireVerifiedStudentRelationship.js";

import * as parentPortalController from "./parent-portal.controller.js";

export const parentPortalRouter: Router = Router();

// §25 : le parent n'est jamais membre du tenant de l'enfant — requireVerifiedStudentRelationship
// (résolveur par défaut = req.params.studentId, d'où les chemins /children/:studentId/...)
// verrouille le tenant à celui de l'enfant, jamais enforceTenantScope/requireTenantMembership.
const verifiedChild = requireVerifiedStudentRelationship();

// §37 : « un parent non abonné ne peut pas consulter les fonctions protégées ». Une
// seule inscription familiale couvre tous les enfants (§9, plafonné par
// FamilyAccount.maxChildren) — un seul gardien, jamais un par enfant. Placé APRÈS
// verifiedChild sur chaque route ci-dessous (jamais avant) : un étranger sans
// relation vérifiée reste bloqué par le 403 de vérification de relation, jamais un
// 402 d'abonnement qui confirmerait au passage l'existence d'un compte familial.
const requireFamilySubscription = requireActiveSubscription(familyAccountOwnerContext);

// Pas de :studentId ici — agrège tous les enfants vérifiés du parent, chacun sous
// son propre verrouillage de tenant (voir parent-portal.service.ts#getParentDashboard).
// Volontairement JAMAIS derrière requireFamilySubscription : ce tableau de bord doit
// rester consultable même sans abonnement (il affiche justement `subscription: null`
// dans ce cas, jamais un abonnement fabriqué) — c'est un aperçu, pas une fonction
// protégée au sens de §37.
parentPortalRouter.get("/dashboard", requireAuth, parentPortalController.getDashboard);

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
  requireEntitlement("report_card.download", familyAccountOwnerContext),
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
  "/children/:studentId/receipts/:receiptId/pdf",
  requireAuth,
  verifiedChild,
  requireFamilySubscription,
  parentPortalController.getChildReceiptPdf,
);
