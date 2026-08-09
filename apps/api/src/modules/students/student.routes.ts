import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as enrollmentController from "./enrollment.controller.js";
import * as studentController from "./student.controller.js";

export const studentRouter: Router = Router();

studentRouter.use(requireAuth, enforceTenantScope, requireTenantMembership);

const readStudents = requirePermission("students.read");
const manageStudents = requirePermission("students.write");

studentRouter.post("/", manageStudents, studentController.createStudent);
studentRouter.get("/", readStudents, studentController.listStudents);
studentRouter.get("/:id", readStudents, studentController.getStudent);
studentRouter.patch("/:id", manageStudents, studentController.updateStudent);
studentRouter.post("/:id/archive", manageStudents, studentController.archiveStudent);

studentRouter.post("/:studentId/enrollments", manageStudents, enrollmentController.enrollStudent);
studentRouter.get("/:studentId/enrollments", readStudents, enrollmentController.listEnrollments);
studentRouter.patch(
  "/:studentId/enrollments/:id",
  manageStudents,
  enrollmentController.updateEnrollmentStatus,
);
