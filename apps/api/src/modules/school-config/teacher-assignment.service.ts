import type { TeacherAssignment } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type {
  CreateTeacherAssignmentInput,
  ListTeacherAssignmentsQuery,
} from "./teacher-assignment.validation.js";

export async function createTeacherAssignment(
  input: CreateTeacherAssignmentInput,
): Promise<TeacherAssignment> {
  const [employee, subject, classroom, academicYear] = await Promise.all([
    prisma.employee.findUnique({ where: { id: input.employeeId } }),
    prisma.subject.findUnique({ where: { id: input.subjectId } }),
    prisma.classroom.findUnique({ where: { id: input.classroomId } }),
    prisma.academicYear.findUnique({ where: { id: input.academicYearId } }),
  ]);
  if (!employee) {
    throw new AppError(404, "EMPLOYEE_NOT_FOUND", `Employee not found: ${input.employeeId}`);
  }
  if (!subject) {
    throw new AppError(404, "SUBJECT_NOT_FOUND", `Subject not found: ${input.subjectId}`);
  }
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

  const existing = await prisma.teacherAssignment.findFirst({
    where: {
      employeeId: input.employeeId,
      subjectId: input.subjectId,
      classroomId: input.classroomId,
      academicYearId: input.academicYearId,
    },
  });
  if (existing) {
    throw new AppError(
      409,
      "ASSIGNMENT_ALREADY_EXISTS",
      "This teacher is already assigned to this subject/classroom for this year",
    );
  }

  return prisma.teacherAssignment.create({
    data: {
      tenantId: requireCurrentTenantId(),
      employeeId: input.employeeId,
      subjectId: input.subjectId,
      classroomId: input.classroomId,
      academicYearId: input.academicYearId,
      ...(input.hoursPerWeek !== undefined ? { hoursPerWeek: input.hoursPerWeek } : {}),
    },
  });
}

export async function listTeacherAssignments(
  query: ListTeacherAssignmentsQuery,
): Promise<TeacherAssignment[]> {
  return prisma.teacherAssignment.findMany({
    where: {
      ...(query.classroomId ? { classroomId: query.classroomId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function removeTeacherAssignment(id: string): Promise<void> {
  const assignment = await prisma.teacherAssignment.findUnique({ where: { id } });
  if (!assignment) {
    throw new AppError(404, "ASSIGNMENT_NOT_FOUND", `Teacher assignment not found: ${id}`);
  }
  await prisma.teacherAssignment.delete({ where: { id } });
}
