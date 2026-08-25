import { Router } from "express";

import { studentOwnerContext } from "../../lib/subscription-access.js";
import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireActiveSubscription } from "../../middleware/requireActiveSubscription.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireLinkedStudent } from "../../middleware/requireLinkedStudent.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as elearningController from "./elearning.controller.js";

export const elearningRouter: Router = Router();

const readElearning = requirePermission("elearning.read");
const writeElearning = requirePermission("elearning.write");

// §3.1/§37 : même garde d'abonnement tenant que les autres modules académiques
// (finance, school-config...) — un établissement dont l'abonnement n'est plus
// actif ne peut pas gérer ou consulter les cours en ligne de son côté staff.
const requireTenantSubscription = requireActiveSubscription();

elearningRouter.post(
  "/courses",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  requireTenantSubscription,
  writeElearning,
  elearningController.createCourse,
);
elearningRouter.get(
  "/courses",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  requireTenantSubscription,
  readElearning,
  elearningController.listCourses,
);
elearningRouter.get(
  "/courses/:id",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  requireTenantSubscription,
  readElearning,
  elearningController.getCourse,
);
elearningRouter.patch(
  "/courses/:id",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  requireTenantSubscription,
  writeElearning,
  elearningController.updateCourse,
);
elearningRouter.delete(
  "/courses/:id",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  requireTenantSubscription,
  writeElearning,
  elearningController.cancelCourse,
);

elearningRouter.post(
  "/courses/:id/resources",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  requireTenantSubscription,
  writeElearning,
  elearningController.addResource,
);
elearningRouter.get(
  "/courses/:id/resources",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  requireTenantSubscription,
  readElearning,
  elearningController.listResources,
);
elearningRouter.delete(
  "/courses/:id/resources/:resourceId",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  requireTenantSubscription,
  writeElearning,
  elearningController.removeResource,
);

elearningRouter.get(
  "/courses/:id/progress",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  requireTenantSubscription,
  readElearning,
  elearningController.listProgress,
);

// §25/§26 : consultation et suivi de progression, self-service élève — même
// raisonnement que /homework/student, jamais enforceTenantScope/requireTenantMembership
// (l'élève n'est pas membre du tenant côté staff), résolu par studentId via
// requireLinkedStudent.
const linkedStudent = requireLinkedStudent();

// §37 : « un élève non abonné ne peut pas consulter les fonctions protégées » —
// toujours après linkedStudent (jamais avant), même raisonnement que le portail élève.
const requireStudentSubscription = requireActiveSubscription(studentOwnerContext);

elearningRouter.get(
  "/student/:studentId/courses",
  requireAuth,
  linkedStudent,
  requireStudentSubscription,
  elearningController.listCoursesForStudent,
);
elearningRouter.get(
  "/student/:studentId/courses/:courseId",
  requireAuth,
  linkedStudent,
  requireStudentSubscription,
  elearningController.getCourseForStudent,
);
elearningRouter.post(
  "/student/:studentId/courses/:courseId/resources/:resourceId/complete",
  requireAuth,
  linkedStudent,
  requireStudentSubscription,
  elearningController.markResourceComplete,
);
