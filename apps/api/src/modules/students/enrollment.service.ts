import type { Enrollment } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma, withTenantSession } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { CreateEnrollmentInput, UpdateEnrollmentStatusInput } from "./enrollment.validation.js";
import { requireStudentRecord } from "./student.service.js";

async function assertReferencesExist(input: CreateEnrollmentInput): Promise<void> {
  const [academicYear, campus, gradeLevel, classroom] = await Promise.all([
    prisma.academicYear.findUnique({ where: { id: input.academicYearId } }),
    prisma.campus.findUnique({ where: { id: input.campusId } }),
    prisma.gradeLevel.findUnique({ where: { id: input.gradeLevelId } }),
    prisma.classroom.findUnique({ where: { id: input.classroomId } }),
  ]);
  if (!academicYear) {
    throw new AppError(404, "ACADEMIC_YEAR_NOT_FOUND", `Academic year not found: ${input.academicYearId}`);
  }
  if (!campus) {
    throw new AppError(404, "CAMPUS_NOT_FOUND", `Campus not found: ${input.campusId}`);
  }
  if (!gradeLevel) {
    throw new AppError(404, "GRADE_LEVEL_NOT_FOUND", `Grade level not found: ${input.gradeLevelId}`);
  }
  if (!classroom) {
    throw new AppError(404, "CLASSROOM_NOT_FOUND", `Classroom not found: ${input.classroomId}`);
  }
  if (classroom.academicYearId !== input.academicYearId) {
    throw new AppError(
      400,
      "CLASSROOM_YEAR_MISMATCH",
      "Classroom does not belong to the given academic year",
    );
  }
}

/** Inscription/réinscription (§19) — one Enrollment row per student per academic year. */
export async function enrollStudent(studentId: string, input: CreateEnrollmentInput): Promise<Enrollment> {
  const student = await requireStudentRecord(studentId);
  await assertReferencesExist(input);

  const existing = await prisma.enrollment.findUnique({
    where: { studentId_academicYearId: { studentId, academicYearId: input.academicYearId } },
  });
  if (existing) {
    throw new AppError(
      409,
      "ALREADY_ENROLLED_THIS_YEAR",
      "Student already has an enrollment for this academic year",
    );
  }

  const tenantId = requireCurrentTenantId();

  return withTenantSession(tenantId, async (tx) => {
    const enrollment = await tx.enrollment.create({
      data: {
        tenantId,
        studentId,
        academicYearId: input.academicYearId,
        classroomId: input.classroomId,
        campusId: input.campusId,
        gradeLevelId: input.gradeLevelId,
      },
    });

    if (student.status === "PROSPECTIVE") {
      await tx.student.update({ where: { id: studentId }, data: { status: "ACTIVE" } });
    }

    return enrollment;
  });
}

export async function listEnrollmentsForStudent(studentId: string): Promise<Enrollment[]> {
  await requireStudentRecord(studentId);
  return prisma.enrollment.findMany({
    where: { studentId, deletedAt: null },
    orderBy: { enrolledAt: "desc" },
  });
}

async function requireEnrollment(studentId: string, id: string): Promise<Enrollment> {
  const enrollment = await prisma.enrollment.findUnique({ where: { id } });
  if (!enrollment || enrollment.deletedAt || enrollment.studentId !== studentId) {
    throw new AppError(404, "ENROLLMENT_NOT_FOUND", `Enrollment not found: ${id}`);
  }
  return enrollment;
}

export async function updateEnrollmentStatus(
  studentId: string,
  id: string,
  input: UpdateEnrollmentStatusInput,
): Promise<Enrollment> {
  await requireEnrollment(studentId, id);

  return prisma.enrollment.update({
    where: { id },
    data: {
      status: input.status,
      ...(input.status === "WITHDRAWN" || input.status === "TRANSFERRED_OUT"
        ? { withdrawnAt: new Date() }
        : {}),
    },
  });
}
