import { Router } from "express";

import { resolveActingEmployeeId } from "../../lib/acting-employee.js";
import { prisma } from "../../lib/prisma.js";
import { imageUpload } from "../../lib/upload-middleware.js";
import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { logoUploadRateLimiter } from "../../middleware/rateLimit.js";
import { requireActiveSubscription } from "../../middleware/requireActiveSubscription.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as academicStructureController from "./academic-structure.controller.js";
import * as academicYearController from "./academic-year.controller.js";
import * as calendarEventController from "./calendar-event.controller.js";
import * as campusController from "./campus.controller.js";
import * as catalogController from "./catalog.controller.js";
import * as minorConsentSettingController from "./minor-consent-setting.controller.js";
import * as programController from "./program.controller.js";
import * as roomController from "./room.controller.js";
import * as subjectCoefficientController from "./subject-coefficient.controller.js";
import * as subjectController from "./subject.controller.js";
import * as teacherAssignmentController from "./teacher-assignment.controller.js";
import * as tenantLogoController from "./tenant-logo.controller.js";
import { getTimetableBreaks, saveTimetableBreaks, timetableBreaksSchema } from "./timetable-breaks.service.js";
import * as timetableController from "./timetable.controller.js";

export const schoolConfigRouter: Router = Router();

// Reference/structural data for a school year: every tenant member may browse it
// (a teacher needs to see classes and subjects), but only staff holding
// tenant.settings.manage may create or edit it (§17).
schoolConfigRouter.use(requireAuth, enforceTenantScope, requireTenantMembership, requireActiveSubscription());

const manageSettings = requirePermission("tenant.settings.manage");
schoolConfigRouter.get("/teaching-staff", manageSettings, (_req, res, next) => { void prisma.employee.findMany({ where: { deletedAt: null, status: { not: "TERMINATED" } }, select: { id: true, tenantId: true, firstName: true, lastName: true }, orderBy: { lastName: "asc" } }).then(data => res.json(data)).catch(next); });
schoolConfigRouter.get("/timetable-breaks", (_req, res, next) => { void getTimetableBreaks().then(data => res.json(data)).catch(next); });
schoolConfigRouter.put("/timetable-breaks", manageSettings, (req, res, next) => { void (async () => res.json(await saveTimetableBreaks(timetableBreaksSchema.parse(req.body), req.user!.id)))().catch(next); });
schoolConfigRouter.get("/my-timetable", (req, res, next) => {
  void (async () => {
    const employeeId = await resolveActingEmployeeId(req.user!.id);
    if (!employeeId) return res.json([]);
    return res.json(await prisma.timetableEntry.findMany({ where: { teacherEmployeeId: employeeId, timetable: { academicYear: { isCurrent: true } } }, include: { subject: true, timetable: { include: { classroom: true } } }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }));
  })().catch(next);
});

// §17 : catalogue de référence global — listes de choix de Configuration. La
// permission d'import dépend du type d'élément (vérifiée dans le contrôleur).
schoolConfigRouter.get("/catalog", catalogController.listCatalogItems);
schoolConfigRouter.get("/catalog/context", catalogController.getCatalogContext);
schoolConfigRouter.post("/catalog/import", catalogController.importCatalogItems);

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

schoolConfigRouter.post("/rooms", manageSettings, roomController.createRoom);
schoolConfigRouter.get("/rooms", roomController.listRooms);
schoolConfigRouter.patch("/rooms/:id", manageSettings, roomController.updateRoom);
schoolConfigRouter.post("/rooms/:id/archive", manageSettings, roomController.archiveRoom);

schoolConfigRouter.post("/calendar-events", manageSettings, calendarEventController.createCalendarEvent);
schoolConfigRouter.get("/calendar-events", calendarEventController.listCalendarEvents);
schoolConfigRouter.patch("/calendar-events/:id", manageSettings, calendarEventController.updateCalendarEvent);
schoolConfigRouter.delete(
  "/calendar-events/:id",
  manageSettings,
  calendarEventController.removeCalendarEvent,
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

// Logo de l'établissement, fourni sous forme d'URL déjà hébergée (même convention
// que Student.photoUrl, §19) — embarqué dans les bulletins, reçus et rapports
// financiers générés en PDF (lib/pdf-letterhead.ts).
schoolConfigRouter.get("/tenant-logo", tenantLogoController.getTenantLogo);
schoolConfigRouter.put("/tenant-logo", manageSettings, tenantLogoController.setTenantLogo);
// logoUploadRateLimiter (même limite que POST /tenants/logo-upload, §14) : sans
// elle, seul apiRateLimiter générique (600 req/15 min par IP) borne cet endpoint,
// qui écrit ~3 Mo par appel (MAX_IMAGE_BYTES) sur le disque partagé sans job de
// purge — un SCHOOL_ADMIN pourrait y boucler et remplir le disque de toute
// l'instance, pas seulement son propre tenant.
schoolConfigRouter.post(
  "/tenant-logo/upload",
  manageSettings,
  logoUploadRateLimiter,
  imageUpload.single("logo"),
  tenantLogoController.uploadTenantLogo,
);
