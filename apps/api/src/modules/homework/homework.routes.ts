import { Router } from "express";

import { studentOwnerContext } from "../../lib/subscription-access.js";
import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireActiveSubscription } from "../../middleware/requireActiveSubscription.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireLinkedStudent } from "../../middleware/requireLinkedStudent.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as homeworkController from "./homework.controller.js";

export const homeworkRouter: Router = Router();

const readHomework = requirePermission("homework.read");
const writeHomework = requirePermission("homework.write");

homeworkRouter.post(
  "/",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  writeHomework,
  homeworkController.createHomework,
);
homeworkRouter.get(
  "/",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  readHomework,
  homeworkController.listHomework,
);
homeworkRouter.get(
  "/:id",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  readHomework,
  homeworkController.getHomework,
);
homeworkRouter.patch(
  "/:id",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  writeHomework,
  homeworkController.updateHomework,
);
homeworkRouter.delete(
  "/:id",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  writeHomework,
  homeworkController.cancelHomework,
);
homeworkRouter.get(
  "/:id/submissions",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  readHomework,
  homeworkController.listSubmissions,
);

// §25/§26 : dépôt de travaux — même raisonnement que /subscriptions/student, jamais
// enforceTenantScope/requireTenantMembership (l'élève n'est pas membre du tenant côté
// staff), résolu par studentId via requireLinkedStudent.
const linkedStudent = requireLinkedStudent();

// §37 : « un élève non abonné ne peut pas consulter les fonctions protégées » —
// toujours après linkedStudent (jamais avant), même raisonnement que le portail élève.
const requireStudentSubscription = requireActiveSubscription(studentOwnerContext);

homeworkRouter.get(
  "/student/:studentId",
  requireAuth,
  linkedStudent,
  requireStudentSubscription,
  homeworkController.listHomeworkForStudent,
);
homeworkRouter.post(
  "/student/:studentId/:homeworkId/submit",
  requireAuth,
  linkedStudent,
  requireStudentSubscription,
  homeworkController.submitHomework,
);
homeworkRouter.get(
  "/student/:studentId/:homeworkId/submission",
  requireAuth,
  linkedStudent,
  requireStudentSubscription,
  homeworkController.getMySubmission,
);
