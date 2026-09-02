import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireActiveSubscription } from "../../middleware/requireActiveSubscription.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as academicStructureController from "./academic-structure.controller.js";
import * as academicYearController from "./academic-year.controller.js";
import * as campusController from "./campus.controller.js";
import * as minorConsentSettingController from "./minor-consent-setting.controller.js";
import * as programController from "./program.controller.js";
import * as subjectCoefficientController from "./subject-coefficient.controller.js";
import * as subjectController from "./subject.controller.js";
import * as teacherAssignmentController from "./teacher-assignment.controller.js";
import * as timetableController from "./timetable.controller.js";

export const schoolConfigRouter: Router = Router();

// Reference/structural data for a school year: every tenant member may browse it
// (a teacher needs to see classes and subjects), but only staff holding
// tenant.settings.manage may create or edit it (§17).
schoolConfigRouter.use(requireAuth, enforceTenantScope, requireTenantMembership, requireActiveSubscription());

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
schoolConfigRouter.post(
  "/subjects/:id/coefficients",
  manageSettings,
  subjectCoefficientController.setSubjectCoefficient,
);
schoolConfigRouter.get("/subjects/:id/coefficients", subjectCoefficientController.listSubjectCoefficients);
schoolConfigRouter.delete(
  "/subjects/:id/coefficients/:coefficientId",
  manageSettings,
  subjectCoefficientController.removeSubjectCoefficient,
);

schoolConfigRouter.post("/programs", manageSettings, programController.createProgram);
schoolConfigRouter.get("/programs", programController.listPrograms);
schoolConfigRouter.patch("/programs/:id", manageSettings, programController.updateProgram);

schoolConfigRouter.post(
  "/teacher-assignments",
  manageSettings,
  teacherAssignmentController.createTeacherAssignment,
);
schoolConfigRouter.get("/teacher-assignments", teacherAssignmentController.listTeacherAssignments);
schoolConfigRouter.delete(
  "/teacher-assignments/:id",
  manageSettings,
  teacherAssignmentController.removeTeacherAssignment,
);

schoolConfigRouter.post("/timetables", manageSettings, timetableController.createTimetable);
schoolConfigRouter.get("/timetables", timetableController.listTimetables);
schoolConfigRouter.post("/timetables/:id/entries", manageSettings, timetableController.addTimetableEntry);
schoolConfigRouter.get("/timetables/:id/entries", timetableController.listTimetableEntries);
schoolConfigRouter.delete(
  "/timetables/:id/entries/:entryId",
  manageSettings,
  timetableController.removeTimetableEntry,
);

// §16 : seuil de majorité/activation du consentement parental requis pour
// l'abonnement individuel d'un élève — lu par la garde du pipeline
// /subscriptions/student/:studentId (subscription.controller.ts).
schoolConfigRouter.get("/minor-consent-setting", minorConsentSettingController.getMinorConsentSetting);
schoolConfigRouter.put(
  "/minor-consent-setting",
  manageSettings,
  minorConsentSettingController.updateMinorConsentSetting,
);
