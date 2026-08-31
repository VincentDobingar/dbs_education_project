import type { Announcement, Assessment, Homework, TeacherAssignment, TimetableEntry } from "@prisma/client";

import { resolveActingEmployeeId } from "../../lib/acting-employee.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

const UPCOMING_ASSESSMENTS_LIMIT = 10;
const UPCOMING_HOMEWORK_LIMIT = 10;
const RECENT_ANNOUNCEMENTS_LIMIT = 10;
const STAFF_FACING_AUDIENCES = ["ALL", "STAFF", "TEACHERS"] as const;

export interface ClassroomToRollCall {
  classroomId: string;
  classroomName: string;
  subjectId: string;
  startTime: string;
  endTime: string;
}

export interface TeacherDashboard {
  employeeId: string;
  classAssignments: TeacherAssignment[];
  todayClasses: TimetableEntry[];
  classesNeedingRollCall: ClassroomToRollCall[];
  upcomingAssessments: Assessment[];
  upcomingHomework: Homework[];
  announcements: Announcement[];
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Schéma : dayOfWeek 0 = lundi ... 6 = dimanche (TimetableEntry) — JS Date#getDay() est 0 = dimanche. */
function schemaDayOfWeek(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

/**
 * §18 "Enseignant" : entièrement auto-scopé par l'employé lié à l'utilisateur
 * appelant, jamais par un paramètre — un enseignant ne peut voir que ses propres
 * classes/cours, quel que soit son rôle exact. "Notes manquantes" (§18) est
 * volontairement absent : un diff fiable élève-par-élève/évaluation-par-évaluation
 * n'existe nulle part ailleurs dans ce code, et l'approximer risquerait d'afficher un
 * chiffre trompeur plutôt qu'utile.
 */
export async function getTeacherDashboard(userId: string): Promise<TeacherDashboard> {
  const employeeId = await resolveActingEmployeeId(userId);
  if (!employeeId) {
    throw new AppError(
      403,
      "EMPLOYEE_RECORD_REQUIRED",
      "Only a staff member with a linked employee record has a teacher dashboard",
    );
  }

  const today = startOfDay(new Date());
  const todayDayOfWeek = schemaDayOfWeek(today);

  // setCurrentAcademicYear (academic-year.service.ts) bascule isCurrent d'une annee a
  // l'autre au changement d'annee scolaire, mais TeacherAssignment/TimetableEntry ne
  // sont jamais purges ni archives -- sans ce filtrage, ce tableau de bord continuait
  // de resoudre les creneaux/affectations d'annees revolues comme s'ils etaient
  // toujours d'actualite, avec un vrai risque d'y enregistrer des presences via
  // classesNeedingRollCall.
  const currentAcademicYear = await prisma.academicYear.findFirst({ where: { isCurrent: true } });

  const [classAssignments, todayClasses] = await Promise.all([
    prisma.teacherAssignment.findMany({
      where: {
        employeeId,
        ...(currentAcademicYear ? { academicYearId: currentAcademicYear.id } : {}),
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.timetableEntry.findMany({
      where: {
        teacherEmployeeId: employeeId,
        dayOfWeek: todayDayOfWeek,
        ...(currentAcademicYear ? { timetable: { academicYearId: currentAcademicYear.id } } : {}),
      },
      orderBy: { startTime: "asc" },
    }),
  ]);

  const timetables = await prisma.timetable.findMany({
    where: { id: { in: todayClasses.map((entry) => entry.timetableId) } },
  });
  const timetablesById = new Map(timetables.map((timetable) => [timetable.id, timetable]));
  const classroomIds = [...new Set(timetables.map((timetable) => timetable.classroomId))];

  const [todayAttendance, classrooms] = await Promise.all([
    prisma.attendance.findMany({
      where: { date: today, classroomId: { in: classroomIds } },
      select: { classroomId: true, subjectId: true },
    }),
    prisma.classroom.findMany({ where: { id: { in: classroomIds } }, select: { id: true, name: true } }),
  ]);
  const rollCalledKeys = new Set(todayAttendance.map((row) => `${row.classroomId}:${row.subjectId ?? ""}`));
  const classroomNameById = new Map(classrooms.map((classroom) => [classroom.id, classroom.name]));

  const classesNeedingRollCall: ClassroomToRollCall[] = todayClasses
    .map((entry) => {
      const timetable = timetablesById.get(entry.timetableId);
      if (!timetable) {
        return null;
      }
      const key = `${timetable.classroomId}:${entry.subjectId}`;
      if (rollCalledKeys.has(key)) {
        return null;
      }
      return {
        classroomId: timetable.classroomId,
        classroomName: classroomNameById.get(timetable.classroomId) ?? timetable.classroomId,
        subjectId: entry.subjectId,
        startTime: entry.startTime,
        endTime: entry.endTime,
      };
    })
    .filter((entry): entry is ClassroomToRollCall => entry !== null);

  const assignedClassroomIds = [...new Set(classAssignments.map((assignment) => assignment.classroomId))];
  const assignedSubjectIds = [...new Set(classAssignments.map((assignment) => assignment.subjectId))];

  const [upcomingAssessments, upcomingHomework, announcements] = await Promise.all([
    prisma.assessment.findMany({
      where: {
        deletedAt: null,
        isPublished: false,
        classroomId: { in: assignedClassroomIds },
        subjectId: { in: assignedSubjectIds },
        scheduledAt: { gte: new Date() },
      },
      orderBy: { scheduledAt: "asc" },
      take: UPCOMING_ASSESSMENTS_LIMIT,
    }),
    prisma.homework.findMany({
      where: {
        deletedAt: null,
        classroomId: { in: assignedClassroomIds },
        subjectId: { in: assignedSubjectIds },
        dueAt: { gte: new Date() },
      },
      orderBy: { dueAt: "asc" },
      take: UPCOMING_HOMEWORK_LIMIT,
    }),
    prisma.announcement.findMany({
      // meme filtrage publishedAt/expiresAt que listAnnouncementsForStudent
      // (announcement.service.ts) -- sans lui, une annonce planifiee pour plus
      // tard ou deja expiree restait visible ici indefiniment, alors qu'elle
      // disparaissait correctement des tableaux de bord parent/eleve au meme
      // instant.
      where: {
        deletedAt: null,
        audienceScope: { in: [...STAFF_FACING_AUDIENCES] },
        publishedAt: { lte: new Date() },
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
      orderBy: { publishedAt: "desc" },
      take: RECENT_ANNOUNCEMENTS_LIMIT,
    }),
  ]);

  return {
    employeeId,
    classAssignments,
    todayClasses,
    classesNeedingRollCall,
    upcomingAssessments,
    upcomingHomework,
    announcements,
  };
}
