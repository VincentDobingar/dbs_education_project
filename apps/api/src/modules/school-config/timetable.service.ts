import type { Timetable, TimetableEntry } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type {
  CreateTimetableEntryInput,
  CreateTimetableInput,
  ListTimetablesQuery,
} from "./timetable.validation.js";

export async function createTimetable(input: CreateTimetableInput): Promise<Timetable> {
  const [classroom, academicYear] = await Promise.all([
    prisma.classroom.findUnique({ where: { id: input.classroomId } }),
    prisma.academicYear.findUnique({ where: { id: input.academicYearId } }),
  ]);
  if (!classroom) {
    throw new AppError(404, "CLASSROOM_NOT_FOUND", `Classroom not found: ${input.classroomId}`);
  }
  if (!academicYear) {
    throw new AppError(404, "ACADEMIC_YEAR_NOT_FOUND", `Academic year not found: ${input.academicYearId}`);
  }
  if (classroom.academicYearId !== input.academicYearId) {
    throw new AppError(
      400,
      "CLASSROOM_YEAR_MISMATCH",
      "Classroom does not belong to the given academic year",
    );
  }

  return prisma.timetable.create({
    data: {
      tenantId: requireCurrentTenantId(),
      classroomId: input.classroomId,
      academicYearId: input.academicYearId,
      ...(input.name ? { name: input.name } : {}),
    },
  });
}

export async function listTimetables(query: ListTimetablesQuery): Promise<Timetable[]> {
  return prisma.timetable.findMany({
    where: {
      ...(query.classroomId ? { classroomId: query.classroomId } : {}),
      ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
}

async function requireTimetable(id: string): Promise<Timetable> {
  const timetable = await prisma.timetable.findUnique({ where: { id } });
  if (!timetable) {
    throw new AppError(404, "TIMETABLE_NOT_FOUND", `Timetable not found: ${id}`);
  }
  return timetable;
}

function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Guards two independent conflicts before an entry can be added: the classroom's
 * own grid can't have two subjects at once, and — checked across every timetable
 * in the same academic year, not just this one — a teacher can't be double-booked
 * in two classrooms simultaneously.
 */
export async function addTimetableEntry(
  timetableId: string,
  input: CreateTimetableEntryInput,
): Promise<TimetableEntry> {
  const timetable = await requireTimetable(timetableId);

  const [subject, teacher, room] = await Promise.all([
    prisma.subject.findUnique({ where: { id: input.subjectId } }),
    prisma.employee.findUnique({ where: { id: input.teacherEmployeeId } }),
    input.roomId ? prisma.room.findUnique({ where: { id: input.roomId } }) : Promise.resolve(undefined),
  ]);
  if (!subject) {
    throw new AppError(404, "SUBJECT_NOT_FOUND", `Subject not found: ${input.subjectId}`);
  }
  if (!teacher) {
    throw new AppError(404, "EMPLOYEE_NOT_FOUND", `Employee not found: ${input.teacherEmployeeId}`);
  }
  if (input.roomId && (!room || room.deletedAt)) {
    throw new AppError(404, "ROOM_NOT_FOUND", `Room not found: ${input.roomId}`);
  }

  const sameClassroomEntries = await prisma.timetableEntry.findMany({
    where: { timetableId, dayOfWeek: input.dayOfWeek },
  });
  const classroomConflict = sameClassroomEntries.some((entry) =>
    timeRangesOverlap(input.startTime, input.endTime, entry.startTime, entry.endTime),
  );
  if (classroomConflict) {
    throw new AppError(
      409,
      "CLASSROOM_SCHEDULE_CONFLICT",
      "This classroom already has an entry overlapping this time slot",
    );
  }

  const teacherEntriesThisYear = await prisma.timetableEntry.findMany({
    where: {
      teacherEmployeeId: input.teacherEmployeeId,
      dayOfWeek: input.dayOfWeek,
      timetable: { academicYearId: timetable.academicYearId },
    },
  });
  const teacherConflict = teacherEntriesThisYear.some((entry) =>
    timeRangesOverlap(input.startTime, input.endTime, entry.startTime, entry.endTime),
  );
  if (teacherConflict) {
    throw new AppError(
      409,
      "TEACHER_SCHEDULE_CONFLICT",
      "This teacher already has an entry overlapping this time slot",
    );
  }

  // §20 : "salles comme entité propre" — même garde que le conflit enseignant
  // ci-dessus (cross-timetable, sur toute l'année scolaire), jamais juste au sein
  // de cette grille : une salle physique n'a qu'une seule classe à la fois, quelle
  // que soit la classe qui la réserve. Seulement quand roomId est fourni — une
  // entrée qui garde roomLabel en texte libre n'a par construction rien à vérifier.
  if (input.roomId) {
    const roomEntriesThisYear = await prisma.timetableEntry.findMany({
      where: {
        roomId: input.roomId,
        dayOfWeek: input.dayOfWeek,
        timetable: { academicYearId: timetable.academicYearId },
      },
    });
    const roomConflict = roomEntriesThisYear.some((entry) =>
      timeRangesOverlap(input.startTime, input.endTime, entry.startTime, entry.endTime),
    );
    if (roomConflict) {
      throw new AppError(
        409,
        "ROOM_SCHEDULE_CONFLICT",
        "This room already has an entry overlapping this time slot",
      );
    }
  }

  return prisma.timetableEntry.create({
    data: {
      tenantId: requireCurrentTenantId(),
      timetableId,
      subjectId: input.subjectId,
      teacherEmployeeId: input.teacherEmployeeId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      ...(input.roomLabel ? { roomLabel: input.roomLabel } : {}),
      ...(input.roomId ? { roomId: input.roomId } : {}),
    },
  });
}

export async function listTimetableEntries(timetableId: string): Promise<TimetableEntry[]> {
  await requireTimetable(timetableId);
  return prisma.timetableEntry.findMany({
    where: { timetableId },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
  });
}

export async function removeTimetableEntry(timetableId: string, id: string): Promise<void> {
  const entry = await prisma.timetableEntry.findUnique({ where: { id } });
  if (!entry || entry.timetableId !== timetableId) {
    throw new AppError(404, "TIMETABLE_ENTRY_NOT_FOUND", `Timetable entry not found: ${id}`);
  }
  await prisma.timetableEntry.delete({ where: { id } });
}
