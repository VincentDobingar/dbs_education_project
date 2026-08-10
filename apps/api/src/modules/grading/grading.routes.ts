import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as assessmentTypeController from "./assessment-type.controller.js";
import * as assessmentController from "./assessment.controller.js";
import * as gradeController from "./grade.controller.js";
import * as reportCardController from "./report-card.controller.js";

export const gradingRouter: Router = Router();

gradingRouter.use(requireAuth, enforceTenantScope, requireTenantMembership);

const manageSettings = requirePermission("tenant.settings.manage");
const readGrades = requirePermission("grades.read");
const writeGrades = requirePermission("grades.write");
const publishGrades = requirePermission("grades.publish");

gradingRouter.post("/assessment-types", manageSettings, assessmentTypeController.createAssessmentType);
gradingRouter.get("/assessment-types", assessmentTypeController.listAssessmentTypes);

gradingRouter.post("/assessments", writeGrades, assessmentController.createAssessment);
gradingRouter.get("/assessments", readGrades, assessmentController.listAssessments);
gradingRouter.patch("/assessments/:id", writeGrades, assessmentController.updateAssessment);
gradingRouter.post("/assessments/:id/publish", publishGrades, assessmentController.publishAssessment);

gradingRouter.put("/assessments/:id/grades", writeGrades, gradeController.setGrades);
gradingRouter.get("/assessments/:id/grades", readGrades, gradeController.listGradesForAssessment);

gradingRouter.patch("/grades/:id/correct", publishGrades, gradeController.correctGrade);

gradingRouter.get("/students/:studentId/grades", readGrades, gradeController.listGradesForStudent);

gradingRouter.post("/report-cards/generate", publishGrades, reportCardController.generateReportCards);
gradingRouter.get("/report-cards", readGrades, reportCardController.listReportCards);
gradingRouter.get("/report-cards/:id", readGrades, reportCardController.getReportCard);
gradingRouter.get("/report-cards/:id/pdf", readGrades, reportCardController.getReportCardPdf);
