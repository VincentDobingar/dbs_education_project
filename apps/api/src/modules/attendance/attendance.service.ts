import type { Attendance } from "@prisma/client";

import { resolveActingEmployeeId } from "../../lib/acting-employee.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";
import { notifyParentsOfStudent } from "../communication/notification.service.js";
import { requireStudentRecord } from "../students/student.service.js";

import type {
  JustifyAbsenceInput,
  ListAttendanceQuery,
  RecordRollCallInput,
} from "./attendance.validation.js";

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * findFirst + create/update rather than Prisma's native upsert: subjectId is nullable
 * in the unique constraint (studentId, classroomId, subjectId, date), and Postgres
 * treats two NULLs as distinct for uniqueness purposes — a native upsert's
 * ON CONFLICT would never match an existing daily (no-subject) roll call and would
 * silently insert a duplicate row every time the same class/day is resubmitted.
 */
export async function recordRollCall(
  input: RecordRollCallInput,
  actingUserId: string,
): Promise<Attendance[]> {
  const classroom = await prisma.classroom.findUnique({ where: { id: input.classroomId } });
  if (!classroom || classroom.deletedAt) {
    throw new AppError(404, "CLASSROOM_NOT_FOUND", `Classroom not found: ${input.classroomId}`);
  }
  if (input.subjectId) {
    const subject = await prisma.subject.findUnique({ where: { id: input.subjectId } });
    if (!subject) {
      throw new AppError(404, "SUBJECT_NOT_FOUND", `Subject not found: ${input.subjectId}`);
    }
  }

  const tenantId = requireCurrentTenantId();
  const recordedByEmployeeId = await resolveActingEmployeeId(actingUserId);
  if (!recordedByEmployeeId) {
    throw new AppError(
      403,
      "EMPLOYEE_RECORD_REQUIRED",
      "Only a staff member with a linked employee record can record attendance",
    );
  }
  const date = startOfDay(input.date);
  const subjectId = input.subjectId ?? null;

  const results: Attendance[] = [];
  for (const entry of input.entries) {
    await requireStudentRecord(entry.studentId);

    const existing = await prisma.attendance.findFirst({
      where: { studentId: entry.studentId, classroomId: input.classroomId, subjectId, date },
    });

    const justificationNote = entry.justificationNote ?? null;

    const attendance = existing
      ? await prisma.attendance.update({
          where: { id: existing.id },
          data: {
            status: entry.status,
            justificationNote,
            ...(recordedByEmployeeId ? { recordedByEmployeeId } : {}),
          },
        })
      : await prisma.attendance.create({
          data: {
            tenantId,
            studentId: entry.studentId,
            classroomId: input.classroomId,
            subjectId,
            date,
            status: entry.status,
            justificationNote,
            ...(recordedByEmployeeId ? { recordedByEmployeeId } : {}),
          },
        });
    results.push(attendance);

    if (attendance.status === "ABSENT") {
      await notifyParentsOfStudent({
        studentId: attendance.studentId,
        type: "attendance.absence",
        title: "Absence enregistrée",
        body: `Une absence a été enregistrée le ${date.toISOString().slice(0, 10)}.`,
      });
    }
  }

  return results;
}

export async function listAttendance(query: ListAttendanceQuery): Promise<Attendance[]> {
  return prisma.attendance.findMany({
    where: {
      ...(query.classroomId ? { classroomId: query.classroomId } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.date ? { date: startOfDay(query.date) } : {}),
      ...(query.startDate || query.endDate
        ? {
            date: {
              ...(query.startDate ? { gte: startOfDay(query.startDate) } : {}),
              ...(query.endDate ? { lte: startOfDay(query.endDate) } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ date: "desc" }],
  });
}

async function requireAttendance(id: string): Promise<Attendance> {
  const attendance = await prisma.attendance.findUnique({ where: { id } });
  if (!attendance) {
    throw new AppError(404, "ATTENDANCE_NOT_FOUND", `Attendance record not found: ${id}`);
  }
  return attendance;
}

/** Only a recorded absence can be justified — a justification doesn't make sense on PRESENT/LATE. */
export async function justifyAbsence(id: string, input: JustifyAbsenceInput): Promise<Attendance> {
  const attendance = await requireAttendance(id);
  if (attendance.status !== "ABSENT") {
    throw new AppError(400, "NOT_AN_ABSENCE", "Only an ABSENT record can be justified");
  }

  return prisma.attendance.update({
    where: { id },
    data: { status: "EXCUSED", justificationNote: input.justificationNote },
  });
}
