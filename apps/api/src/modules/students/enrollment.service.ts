import type { Enrollment } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma, withTenantSession } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";
import {
  agreementLinesJson,
  computeEnrollmentSchedule,
  isReturningStudent,
  outstandingArrearsCents,
  yearUsesFeePlans,
} from "../finance/fee-schedule/schedule.service.js";

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
export async function enrollStudent(
  studentId: string,
  input: CreateEnrollmentInput,
  actingUserId?: string,
): Promise<Enrollment> {
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

  // Échéancier flexible dès qu'un plan existe pour l'année ; sinon l'ancien
  // échéancier de la période d'inscription (1 à 3 montants datés) s'applique.
  const usesPlans = await yearUsesFeePlans(input.academicYearId);
  const flexible = usesPlans
    ? await computeEnrollmentSchedule({
        tenantId,
        studentId,
        academicYearId: input.academicYearId,
        gradeLevelId: input.gradeLevelId,
        classroomId: input.classroomId,
        optionalFeeStructureIds: input.optionalFeeStructureIds,
        discountPresetIds: input.discountPresetIds,
        manualDiscounts: input.manualDiscounts,
      })
    : null;
  const legacyInstallments = flexible ? [] : installmentsSchema.parse(period.installments);

  if (flexible && flexible.policy.reenrollmentWithArrears === "BLOCK") {
    const arrears = await outstandingArrearsCents(studentId, input.academicYearId);
    if (arrears > 0) {
      throw new AppError(
        409,
        "ENROLLMENT_ARREARS_OUTSTANDING",
        "Cet élève a des arriérés d'une année précédente : réglez-les avant la réinscription",
      );
    }
  }

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
    const activeStatus = previousEnrollment ? "RE_ENROLLED" : "ENROLLED";
    // L'élève n'apparaît dans sa classe qu'une fois l'inscription payée : en attendant,
    // il est « admis » (ADMITTED), statut exclu de toutes les listes de classe.
    const registrationDue = flexible?.schedule.dues.find((due) => due.kind === "REGISTRATION") ?? null;
    const enrollment = await tx.enrollment.create({
      data: {
        tenantId,
        studentId,
        academicYearId: input.academicYearId,
        registrationPeriodId: period.id,
        classroomId: input.classroomId,
        campusId: input.campusId,
        gradeLevelId: input.gradeLevelId,
        status: registrationDue ? "ADMITTED" : activeStatus,
      },
    });

    if (flexible) {
      const { schedule } = flexible;
      const agreement = await tx.studentFeeAgreement.create({
        data: {
          tenantId,
          enrollmentId: enrollment.id,
          studentId,
          academicYearId: input.academicYearId,
          feePlanId: flexible.plan?.id ?? null,
          isReturning: previousEnrollment !== null,
          lines: agreementLinesJson(flexible.lines),
          grossCents: schedule.grossCents,
          discountCents: schedule.discountCents,
          totalCents: schedule.totalCents,
          ...(actingUserId ? { createdById: actingUserId } : {}),
        },
      });
      if (schedule.discounts.length > 0) {
        await tx.studentFeeDiscount.createMany({
          data: schedule.discounts.map((discount) => ({
            tenantId,
            agreementId: agreement.id,
            presetId: discount.presetId ?? null,
            label: discount.label,
            kind: discount.kind,
            value: discount.value,
            amountCents: discount.amountCents,
            reason: discount.reason ?? null,
            grantedByUserId: actingUserId ?? null,
          })),
        });
      }
      for (const due of schedule.dues) {
        await tx.studentInvoice.create({
          data: {
            tenantId,
            studentId,
            academicYearId: input.academicYearId,
            number: `INS-${enrollment.id}-${due.kind === "REGISTRATION" ? "R" : due.sequence}`,
            status: "ISSUED",
            kind: due.kind,
            agreementId: agreement.id,
            installmentSequence: due.sequence,
            totalCents: due.totalCents,
            dueAt: due.dueDate,
            issuedAt: new Date(),
            items: {
              create: due.items.map((item) => ({
                description:
                  due.kind === "REGISTRATION" || item.nature !== "TUITION"
                    ? item.label
                    : `${item.label} — ${due.label}`,
                amountCents: item.amountCents,
                discountCents: item.discountCents,
                ...(item.feeStructureId ? { feeStructureId: item.feeStructureId } : {}),
              })),
            },
          },
        });
      }
    } else {
      for (const [index, installment] of legacyInstallments.entries()) {
        await tx.studentInvoice.create({
          data: {
            tenantId,
            studentId,
            academicYearId: input.academicYearId,
            number: `INS-${enrollment.id}-${index + 1}`,
            status: "ISSUED",
            kind: "INSTALLMENT",
            installmentSequence: index + 1,
            totalCents: installment.amountCents,
            dueAt: new Date(installment.dueDate),
            issuedAt: new Date(),
            items: {
              create: {
                description: `${period.name} — tranche ${index + 1}/${legacyInstallments.length}`,
                amountCents: installment.amountCents,
              },
            },
          },
        });
      }
    }

    if (student.status === "PROSPECTIVE" && !registrationDue) {
      await tx.student.update({ where: { id: studentId }, data: { status: "ACTIVE" } });
    }

    return enrollment;
  });
}

/** Aperçu de l'échéancier avant validation (rien n'est écrit). */
export async function previewEnrollment(studentId: string, input: CreateEnrollmentInput) {
  await requireStudentRecord(studentId);
  await assertReferencesExist(input);
  const tenantId = requireCurrentTenantId();
  if (!(await yearUsesFeePlans(input.academicYearId))) {
    const period = await prisma.registrationPeriod.findUnique({ where: { id: input.registrationPeriodId } });
    const installments = period ? installmentsSchema.parse(period.installments) : [];
    return {
      mode: "LEGACY" as const,
      isReturning: await isReturningStudent(studentId, input.academicYearId),
      planName: null,
      optionalChoices: [],
      discounts: [],
      arrearsCents: await outstandingArrearsCents(studentId, input.academicYearId),
      dues: installments.map((installment, index) => ({
        kind: "INSTALLMENT" as const,
        sequence: index + 1,
        label: `Tranche ${index + 1}`,
        dueDate: installment.dueDate,
        totalCents: installment.amountCents,
        items: [],
      })),
      totalCents: installments.reduce((sum, installment) => sum + installment.amountCents, 0),
      grossCents: installments.reduce((sum, installment) => sum + installment.amountCents, 0),
      discountCents: 0,
      registrationCents: 0,
      groupedSequences: [],
      skippedSequences: [],
      reenrollmentBlocked: false,
    };
  }
  const computed = await computeEnrollmentSchedule({
    tenantId,
    studentId,
    academicYearId: input.academicYearId,
    gradeLevelId: input.gradeLevelId,
    classroomId: input.classroomId,
    optionalFeeStructureIds: input.optionalFeeStructureIds,
    discountPresetIds: input.discountPresetIds,
    manualDiscounts: input.manualDiscounts,
  });
  const arrearsCents = await outstandingArrearsCents(studentId, input.academicYearId);
  return {
    mode: computed.mode,
    isReturning: computed.isReturning,
    planName: computed.plan?.name ?? null,
    optionalChoices: computed.optionalChoices,
    discounts: computed.schedule.discounts,
    arrearsCents,
    dues: computed.schedule.dues.map((due) => ({ ...due, dueDate: due.dueDate.toISOString() })),
    totalCents: computed.schedule.totalCents,
    grossCents: computed.schedule.grossCents,
    discountCents: computed.schedule.discountCents,
    registrationCents: computed.schedule.registrationCents,
    groupedSequences: computed.schedule.groupedSequences,
    skippedSequences: computed.schedule.skippedSequences,
    reenrollmentBlocked: computed.policy.reenrollmentWithArrears === "BLOCK" && arrearsCents > 0,
  };
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
  const enrollment = await requireEnrollment(studentId, id);
  const leaving = input.status === "WITHDRAWN" || input.status === "TRANSFERRED_OUT";
  const tenantId = requireCurrentTenantId();

  return withTenantSession(tenantId, async (tx) => {
    const updated = await tx.enrollment.update({
      where: { id },
      data: { status: input.status, ...(leaving ? { withdrawnAt: new Date() } : {}) },
    });
    if (leaving) {
      // Abandon, exclusion, transfert : les échéances futures non entamées sont
      // annulées ; l'inscription déjà payée n'est pas remboursée. Un élève parti
      // avant d'avoir payé son inscription n'a plus rien à payer.
      const agreement = await tx.studentFeeAgreement.findUnique({ where: { enrollmentId: id } });
      if (agreement) {
        const now = new Date();
        await tx.studentInvoice.updateMany({
          where: {
            agreementId: agreement.id,
            paidCents: 0,
            status: { in: ["ISSUED", "OVERDUE"] },
            ...(enrollment.status === "ADMITTED" ? {} : { dueAt: { gt: now }, kind: "INSTALLMENT" }),
          },
          data: { status: "CANCELLED" },
        });
        await tx.studentFeeAgreement.update({ where: { id: agreement.id }, data: { status: "CLOSED" } });
      }
    }
    return updated;
  });
}
