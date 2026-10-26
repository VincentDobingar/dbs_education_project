import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireActiveSubscription } from "../../middleware/requireActiveSubscription.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requirePlatformRole } from "../../middleware/requirePlatformRole.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as remedialController from "./remedial.controller.js";

/**
 * Établissement de l'enseignant (/api/v1/remedial) : direction (remedial.manage)
 * et enseignants (remedial.teach). Les contrôles « offre de l'enseignant » ou
 * « offre de l'établissement » sont faits dans remedial-school.service.ts.
 */
export const remedialSchoolRouter: Router = Router();
remedialSchoolRouter.use(
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  requireActiveSubscription(),
);

const manage = requirePermission("remedial.manage");
const teach = requirePermission("remedial.teach");

remedialSchoolRouter.get("/context", remedialController.getContext);
remedialSchoolRouter.get("/tariffs", remedialController.listTariffs);
remedialSchoolRouter.post("/tariffs", manage, remedialController.createTariff);
remedialSchoolRouter.put("/tariffs/:id", manage, remedialController.updateTariff);

remedialSchoolRouter.get("/offers", remedialController.listOffers);
remedialSchoolRouter.post("/offers", teach, remedialController.createOffer);
remedialSchoolRouter.put("/offers/:id", teach, remedialController.updateOffer);
remedialSchoolRouter.post("/offers/:id/submit", teach, remedialController.submitOffer);
remedialSchoolRouter.post("/offers/:id/review", manage, remedialController.reviewOffer);
remedialSchoolRouter.post("/offers/:id/close", remedialController.closeOffer);
remedialSchoolRouter.get("/offers/:id/enrollments", remedialController.listOfferEnrollments);
remedialSchoolRouter.post("/enrollments/:id/cash-payment", manage, remedialController.recordCashPayment);
remedialSchoolRouter.get("/payouts", remedialController.listSchoolPayouts);

/**
 * Famille (/api/v1/remedial-portal) : jamais enforceTenantScope — l'élève et
 * l'enseignant appartiennent à deux établissements différents ; l'autorisation
 * vient de la relation parent vérifiée ou du lien élève (remedial-portal.service.ts).
 */
export const remedialPortalRouter: Router = Router();
remedialPortalRouter.get("/catalog", remedialController.listCatalog);
remedialPortalRouter.use(requireAuth);
remedialPortalRouter.get("/learners", remedialController.listLearners);
remedialPortalRouter.get("/enrollments", remedialController.listMyEnrollments);
remedialPortalRouter.post("/enrollments", remedialController.enroll);
remedialPortalRouter.post("/enrollments/:id/cancel", remedialController.cancelEnrollment);
remedialPortalRouter.get("/enrollments/:id/payment-options", remedialController.listPaymentOptions);
remedialPortalRouter.post("/enrollments/:id/pay", remedialController.payOnline);
remedialPortalRouter.get("/enrollments/:id/payments/:paymentIntentId", remedialController.getPaymentStatus);

/** Super-administration (/api/v1/platform/remedial). */
export const remedialPlatformRouter: Router = Router();
remedialPlatformRouter.use(requireAuth);
remedialPlatformRouter.get(
  "/payouts",
  requirePlatformRole("SUPER_ADMIN", "PLATFORM_ADMIN", "BILLING_MANAGER", "PLATFORM_AUDITOR"),
  remedialController.listPlatformPayouts,
);
remedialPlatformRouter.post(
  "/payouts/:id/mark-paid",
  requirePlatformRole("SUPER_ADMIN", "BILLING_MANAGER"),
  remedialController.markPayoutPaid,
);
