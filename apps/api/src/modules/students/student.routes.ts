import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as documentController from "./document.controller.js";
import * as enrollmentController from "./enrollment.controller.js";
import * as idCardController from "./id-card.controller.js";
import * as importExportController from "./import-export.controller.js";
import * as studentController from "./student.controller.js";

export const studentRouter: Router = Router();

studentRouter.use(requireAuth, enforceTenantScope, requireTenantMembership);

const readStudents = requirePermission("students.read");
const manageStudents = requirePermission("students.write");

studentRouter.post("/", manageStudents, studentController.createStudent);
studentRouter.get("/", readStudents, studentController.listStudents);
// Must be registered before "/:id" — otherwise Express would capture this path
// segment as the :id param instead.
studentRouter.get("/check-duplicates", readStudents, studentController.checkDuplicateStudents);
studentRouter.post("/import", manageStudents, importExportController.importStudents);
studentRouter.get("/export", readStudents, importExportController.exportStudents);
studentRouter.get("/:id", readStudents, studentController.getStudent);
studentRouter.patch("/:id", manageStudents, studentController.updateStudent);
studentRouter.post("/:id/archive", manageStudents, studentController.archiveStudent);
studentRouter.get("/:id/id-card", readStudents, idCardController.generateIdCard);

studentRouter.post("/:studentId/enrollments", manageStudents, enrollmentController.enrollStudent);
studentRouter.get("/:studentId/enrollments", readStudents, enrollmentController.listEnrollments);
studentRouter.patch(
  "/:studentId/enrollments/:id",
  manageStudents,
  enrollmentController.updateEnrollmentStatus,
);

studentRouter.post("/:studentId/documents", manageStudents, documentController.addStudentDocument);
studentRouter.get("/:studentId/documents", readStudents, documentController.listStudentDocuments);
studentRouter.delete("/:studentId/documents/:id", manageStudents, documentController.removeStudentDocument);
