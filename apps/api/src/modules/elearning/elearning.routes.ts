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

elearningRouter.post(
  "/courses",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  writeElearning,
  elearningController.createCourse,
);
elearningRouter.get(
  "/courses",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  readElearning,
  elearningController.listCourses,
);
elearningRouter.get(
  "/courses/:id",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  readElearning,
  elearningController.getCourse,
);
elearningRouter.patch(
  "/courses/:id",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  writeElearning,
  elearningController.updateCourse,
);
elearningRouter.delete(
  "/courses/:id",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  writeElearning,
  elearningController.cancelCourse,
);

elearningRouter.post(
  "/courses/:id/resources",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  writeElearning,
  elearningController.addResource,
);
elearningRouter.get(
  "/courses/:id/resources",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  readElearning,
  elearningController.listResources,
);
elearningRouter.delete(
  "/courses/:id/resources/:resourceId",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  writeElearning,
  elearningController.removeResource,
);

elearningRouter.get(
  "/courses/:id/progress",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
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
