import type { NextFunction, Request, Response } from "express";

import { resolveActingEmployeeId } from "../../lib/acting-employee.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { recordRollCall } from "../attendance/attendance.service.js";
import { recordRollCallSchema } from "../attendance/attendance.validation.js";
import { createAssessment } from "../grading/assessment.service.js";
import { createAssessmentSchema } from "../grading/assessment.validation.js";
import { setGrades } from "../grading/grade.service.js";
import { setGradesSchema } from "../grading/grade.validation.js";

import { getTeacherDashboard } from "./teacher-dashboard.service.js";

function action(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req, res).catch(next);
  };
}
async function employeeFor(userId: string) {
  const id = await resolveActingEmployeeId(userId);
  if (!id)
    throw new AppError(
      403,
      "EMPLOYEE_RECORD_REQUIRED",
      "Votre compte doit être lié à une fiche personnel active.",
    );
  return id;
}
async function assigned(req: Request) {
  const employeeId = await employeeFor(req.user!.id);
  const assignment = await prisma.teacherAssignment.findUnique({
    where: { id: req.params.assignmentId as string },
    include: { academicYear: true, classroom: true },
  });
  if (
    !assignment ||
    assignment.employeeId !== employeeId ||
    !assignment.academicYear.isCurrent ||
    assignment.academicYear.deletedAt ||
    assignment.classroom.deletedAt
  )
    throw new AppError(
      403,
      "TEACHER_ASSIGNMENT_REQUIRED",
      "Cette affectation ne vous est pas attribuée pour l'année en cours.",
    );
  return assignment;
}
async function rosterIds(classroomId: string, academicYearId: string) {
  return prisma.enrollment.findMany({
    where: {
      classroomId,
      academicYearId,
      deletedAt: null,
      status: { in: ["ENROLLED", "RE_ENROLLED"] },
      student: { deletedAt: null, status: { in: ["ACTIVE", "PROSPECTIVE"] } },
    },
    include: { student: { select: { id: true, firstName: true, lastName: true, matricule: true } } },
  });
}
function requireRoster(ids: string[], roster: { studentId: string }[]) {
  const allowed = new Set(roster.map((e) => e.studentId));
  if (ids.some((id) => !allowed.has(id)))
    throw new AppError(400, "STUDENT_NOT_IN_CLASS", "Un élève ne fait pas partie de cette classe.");
}
export const workspace = action(async (req, res) => {
  const employeeId = await employeeFor(req.user!.id);
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { tenantId: true, id: true, firstName: true, lastName: true, email: true },
  });
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true, deletedAt: null } });
  const assignments = year
    ? await prisma.teacherAssignment.findMany({
        where: { employeeId, academicYearId: year.id },
        include: { subject: true, classroom: true, academicYear: true },
        orderBy: { classroom: { name: "asc" } },
      })
    : [];
  const periods = year
    ? await prisma.academicPeriod.findMany({
        where: { academicYearId: year.id },
        orderBy: { startDate: "asc" },
      })
    : [];
  const assessmentTypes = await prisma.assessmentType.findMany({ orderBy: { nameFr: "asc" } });
  const summary = await getTeacherDashboard(req.user!.id);
  return res.json({ employee, assignments, periods, assessmentTypes, summary });
});
export const classroomWorkspace = action(async (req, res) => {
  const a = await assigned(req);
  const roster = await rosterIds(a.classroomId, a.academicYearId);
  const assessments = await prisma.assessment.findMany({
    where: {
      classroomId: a.classroomId,
      subjectId: a.subjectId,
      academicPeriod: { academicYearId: a.academicYearId },
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
  return res.json({ students: roster.map((e) => e.student), assessments });
});
export const assessmentGrades = action(async (req, res) => {
  const a = await assigned(req);
  const assessment = await prisma.assessment.findUnique({
    where: { id: req.params.assessmentId as string },
    include: { academicPeriod: true },
  });
  if (
    !assessment ||
    assessment.deletedAt ||
    assessment.classroomId !== a.classroomId ||
    assessment.subjectId !== a.subjectId ||
    assessment.academicPeriod.academicYearId !== a.academicYearId
  )
    throw new AppError(404, "ASSESSMENT_NOT_FOUND", "Évaluation introuvable");
  return res.json(await prisma.grade.findMany({ where: { assessmentId: assessment.id } }));
});
export const saveAttendance = action(async (req, res) => {
  const a = await assigned(req);
  const input = recordRollCallSchema.parse({
    ...req.body,
    classroomId: a.classroomId,
    subjectId: a.subjectId,
  });
  requireRoster(
    input.entries.map((e) => e.studentId),
    await rosterIds(a.classroomId, a.academicYearId),
  );
  return res.json(await recordRollCall(input, req.user!.id));
});
export const saveGrades = action(async (req, res) => {
  const a = await assigned(req);
  const assessment = await prisma.assessment.findUnique({
    where: { id: req.params.assessmentId as string },
    include: { academicPeriod: true },
  });
  if (
    !assessment ||
    assessment.deletedAt ||
    assessment.classroomId !== a.classroomId ||
    assessment.subjectId !== a.subjectId ||
    assessment.academicPeriod.academicYearId !== a.academicYearId
  )
    throw new AppError(404, "ASSESSMENT_NOT_FOUND", "Évaluation introuvable");
  const input = setGradesSchema.parse(req.body);
  requireRoster(
    input.grades.map((g) => g.studentId),
    await rosterIds(a.classroomId, a.academicYearId),
  );
  if (input.grades.some((g) => !g.isAbsent && g.score !== undefined && g.score > Number(assessment.maxScore)))
    throw new AppError(400, "SCORE_EXCEEDS_MAX", "Une note dépasse le barème.");
  return res.json(await setGrades(assessment.id, input, req.user!.id));
});
export const newAssessment = action(async (req, res) => {
  const a = await assigned(req);
  const input = createAssessmentSchema.parse({
    ...req.body,
    classroomId: a.classroomId,
    subjectId: a.subjectId,
  });
  return res.status(201).json(await createAssessment(input));
});

export function getAttendanceForAssignment(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const a = await assigned(req);
    const value = req.query.date ?? new Date().toISOString().slice(0, 10);
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      throw new AppError(400, "INVALID_DATE", "Date invalide");
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new AppError(400, "INVALID_DATE", "Date invalide");
    if (date.toISOString().slice(0, 10) !== value)
      throw new AppError(400, "INVALID_DATE", "Date invalide");
    date.setUTCHours(0, 0, 0, 0);
    res.json(
      await prisma.attendance.findMany({
        where: { classroomId: a.classroomId, subjectId: a.subjectId, date },
      }),
    );
  })().catch(next);
}
