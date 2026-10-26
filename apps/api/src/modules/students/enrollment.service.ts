import type { Enrollment } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma, withTenantSession } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { CreateEnrollmentInput, UpdateEnrollmentStatusInput } from "./enrollment.validation.js";
import { installmentsSchema } from "./registration.validation.js";
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
  if (classroom.campusId !== input.campusId || classroom.gradeLevelId !== input.gradeLevelId) {
    throw new AppError(
      400,
      "CLASSROOM_STRUCTURE_MISMATCH",
      "Le campus et le niveau doivent correspondre à la classe",
    );
  }
}

/** Inscription/réinscription (§19) — one Enrollment row per student per academic year. */
export async function enrollStudent(studentId: string, input: CreateEnrollmentInput): Promise<Enrollment> {
  const student = await requireStudentRecord(studentId);
  await assertReferencesExist(input);
  if (!student.primaryGuardianId) {
    throw new AppError(
      400,
      "PRIMARY_GUARDIAN_REQUIRED",
      "Renseignez le parent/tuteur principal avant l'inscription",
    );
  }
  const period = await prisma.registrationPeriod.findUnique({ where: { id: input.registrationPeriodId } });
  if (!period || period.academicYearId !== input.academicYearId) {
    throw new AppError(
      400,
      "REGISTRATION_PERIOD_YEAR_MISMATCH",
      "La période doit appartenir à l'année de la classe",
    );
  }
  if (!period.isOpen || period.startDate > new Date() || period.endDate < new Date()) {
    throw new AppError(
      400,
      "REGISTRATION_PERIOD_CLOSED",
      "La période d'inscription est fermée ou hors dates",
    );
  }
  const installments = installmentsSchema.parse(period.installments);

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
    // Sérialiser les inscriptions d'un élève : deux requêtes concurrentes ne
    // créent ni deux inscriptions ni un second jeu de factures.
    await tx.$queryRaw`SELECT id FROM "Student" WHERE id = ${studentId} AND "tenantId" = ${tenantId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "RegistrationPeriod" WHERE id = ${period.id} AND "tenantId" = ${tenantId} FOR SHARE`;
    const currentPeriod = await tx.registrationPeriod.findUnique({ where: { id: period.id } });
    if (
      !currentPeriod?.isOpen ||
      currentPeriod.startDate > new Date() ||
      currentPeriod.endDate < new Date()
    ) {
      throw new AppError(
        400,
        "REGISTRATION_PERIOD_CLOSED",
        "La période d'inscription est fermée ou hors dates",
      );
    }
    const currentStudent = await tx.student.findUnique({ where: { id: studentId } });
    if (
      !currentStudent ||
      currentStudent.deletedAt ||
      ["ARCHIVED", "TRANSFERRED", "GRADUATED", "WITHDRAWN"].includes(currentStudent.status)
    ) {
      throw new AppError(400, "STUDENT_NOT_ENROLLABLE", "Le dossier élève ne permet pas une inscription");
    }
    if (!currentStudent.primaryGuardianId)
      throw new AppError(400, "PRIMARY_GUARDIAN_REQUIRED", "Tuteur principal obligatoire");
    if (
      await tx.enrollment.findUnique({
        where: { studentId_academicYearId: { studentId, academicYearId: input.academicYearId } },
      })
    ) {
      throw new AppError(
        409,
        "ALREADY_ENROLLED_THIS_YEAR",
        "Cet élève est déjà inscrit pour cette année académique",
      );
    }
    const previousEnrollment = await tx.enrollment.findFirst({
      where: { studentId, tenantId, deletedAt: null },
    });
    const enrollment = await tx.enrollment.create({
      data: {
        tenantId,
        studentId,
        academicYearId: input.academicYearId,
        registrationPeriodId: period.id,
        classroomId: input.classroomId,
        campusId: input.campusId,
        gradeLevelId: input.gradeLevelId,
        status: previousEnrollment ? "RE_ENROLLED" : "ENROLLED",
      },
    });

    for (const [index, installment] of installments.entries()) {
      await tx.studentInvoice.create({
        data: {
          tenantId,
          studentId,
          academicYearId: input.academicYearId,
          number: `INS-${enrollment.id}-${index + 1}`,
          status: "ISSUED",
          totalCents: installment.amountCents,
          dueAt: new Date(installment.dueDate),
          issuedAt: new Date(),
          items: {
            create: {
              description: `${period.name} — tranche ${index + 1}/${installments.length}`,
              amountCents: installment.amountCents,
            },
          },
        },
      });
    }

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
