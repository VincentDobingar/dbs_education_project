import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as academicStructureController from "./academic-structure.controller.js";
import * as academicYearController from "./academic-year.controller.js";
import * as campusController from "./campus.controller.js";
import * as subjectController from "./subject.controller.js";

export const schoolConfigRouter: Router = Router();

// Reference/structural data for a school year: every tenant member may browse it
// (a teacher needs to see classes and subjects), but only staff holding
// tenant.settings.manage may create or edit it (§17).
schoolConfigRouter.use(requireAuth, enforceTenantScope, requireTenantMembership);

const manageSettings = requirePermission("tenant.settings.manage");

schoolConfigRouter.post("/campuses", manageSettings, campusController.createCampus);
schoolConfigRouter.get("/campuses", campusController.listCampuses);
schoolConfigRouter.patch("/campuses/:id", manageSettings, campusController.updateCampus);

schoolConfigRouter.post("/academic-years", manageSettings, academicYearController.createAcademicYear);
schoolConfigRouter.get("/academic-years", academicYearController.listAcademicYears);
schoolConfigRouter.patch("/academic-years/:id", manageSettings, academicYearController.updateAcademicYear);
schoolConfigRouter.post(
  "/academic-years/:id/set-current",
  manageSettings,
  academicYearController.setCurrentAcademicYear,
);
schoolConfigRouter.post(
  "/academic-years/:id/periods",
  manageSettings,
  academicYearController.createAcademicPeriod,
);
schoolConfigRouter.get("/academic-years/:id/periods", academicYearController.listAcademicPeriods);

schoolConfigRouter.post(
  "/education-cycles",
  manageSettings,
  academicStructureController.createEducationCycle,
);
schoolConfigRouter.get("/education-cycles", academicStructureController.listEducationCycles);
schoolConfigRouter.post(
  "/education-cycles/:cycleId/grade-levels",
  manageSettings,
  academicStructureController.createGradeLevel,
);
schoolConfigRouter.get("/grade-levels", academicStructureController.listGradeLevels);

schoolConfigRouter.post("/classrooms", manageSettings, academicStructureController.createClassroom);
schoolConfigRouter.get("/classrooms", academicStructureController.listClassrooms);
schoolConfigRouter.patch("/classrooms/:id", manageSettings, academicStructureController.updateClassroom);

schoolConfigRouter.post("/departments", manageSettings, subjectController.createDepartment);
schoolConfigRouter.get("/departments", subjectController.listDepartments);
schoolConfigRouter.post("/subjects", manageSettings, subjectController.createSubject);
schoolConfigRouter.get("/subjects", subjectController.listSubjects);
schoolConfigRouter.patch("/subjects/:id", manageSettings, subjectController.updateSubject);
