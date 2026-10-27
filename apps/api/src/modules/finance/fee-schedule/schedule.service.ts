import type { FeePlan, FeePlanInstallment, Prisma } from "@prisma/client";

import { AppError } from "../../../lib/errors.js";
import { prisma } from "../../../lib/prisma.js";
import { getFeePolicy } from "../fee-setup.service.js";
import type { FeePolicy } from "../fee-setup.validation.js";

import {
  buildSchedule,
  optionalFeeChoices,
  resolveInstallmentDates,
  selectFeeLines,
  type DiscountInput,
  type FeeLine,
  type FeeStructureCandidate,
  type ScheduleResult,
} from "./engine.js";

export interface ManualDiscountInput {
  label: string;
  kind: "PERCENT" | "AMOUNT";
  value: number;
  reason: string;
}

export interface EnrollmentScheduleRequest {
  tenantId: string;
  studentId: string;
  academicYearId: string;
  gradeLevelId: string;
  classroomId: string;
  optionalFeeStructureIds?: string[] | undefined;
  discountPresetIds?: string[] | undefined;
  manualDiscounts?: ManualDiscountInput[] | undefined;
  enrollmentDate?: Date | undefined;
}

export interface EnrollmentSchedule {
  mode: "PLAN" | "LEGACY";
  isReturning: boolean;
  plan: (FeePlan & { installments: FeePlanInstallment[] }) | null;
  lines: FeeLine[];
  optionalChoices: FeeLine[];
  discountInputs: DiscountInput[];
  schedule: ScheduleResult;
  policy: FeePolicy;
}

/** Le plan d'un cycle prime sur le plan général de l'année. */
export async function resolveFeePlan(
  academicYearId: string,
  gradeLevelId: string,
): Promise<(FeePlan & { installments: FeePlanInstallment[] }) | null> {
  const level = await prisma.gradeLevel.findUnique({ where: { id: gradeLevelId } });
  const plans = await prisma.feePlan.findMany({
    where: { academicYearId },
    include: { installments: { orderBy: { sequence: "asc" } } },
  });
  return (
    plans.find((plan) => level && plan.educationCycleId === level.cycleId) ??
    plans.find((plan) => plan.educationCycleId === null) ??
    null
  );
}

/** L'échéancier flexible s'applique dès que l'établissement a défini un plan pour l'année. */
export async function yearUsesFeePlans(academicYearId: string): Promise<boolean> {
  return (await prisma.feePlan.count({ where: { academicYearId } })) > 0;
}

export async function isReturningStudent(studentId: string, academicYearId: string): Promise<boolean> {
  const previous = await prisma.enrollment.findFirst({
    where: { studentId, deletedAt: null, academicYearId: { not: academicYearId } },
  });
  return previous !== null;
}

/** Échéances non soldées des autres années (ou déjà échues) : les arriérés. */
export async function outstandingArrearsCents(studentId: string, academicYearId: string): Promise<number> {
  const invoices = await prisma.studentInvoice.findMany({
    where: {
      studentId,
      deletedAt: null,
      academicYearId: { not: academicYearId },
      status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
    },
    select: { totalCents: true, paidCents: true },
  });
  return invoices.reduce((sum, invoice) => sum + Math.max(invoice.totalCents - invoice.paidCents, 0), 0);
}

export async function computeEnrollmentSchedule(
  request: EnrollmentScheduleRequest,
): Promise<EnrollmentSchedule> {
  const enrollmentDate = request.enrollmentDate ?? new Date();
  const [policy, plan, isReturning, classroom, structures, periods] = await Promise.all([
    getFeePolicy(request.tenantId),
    resolveFeePlan(request.academicYearId, request.gradeLevelId),
    isReturningStudent(request.studentId, request.academicYearId),
    prisma.classroom.findUnique({ where: { id: request.classroomId } }),
    prisma.feeStructure.findMany({
      where: { academicYearId: request.academicYearId },
      include: { feeCategory: true },
    }),
    prisma.academicPeriod.findMany({ where: { academicYearId: request.academicYearId } }),
  ]);

  const candidates: FeeStructureCandidate[] = structures.map((structure) => ({
    id: structure.id,
    feeCategoryId: structure.feeCategoryId,
    categoryLabel: structure.feeCategory.nameFr,
    nature: structure.feeCategory.nature,
    gradeLevelId: structure.gradeLevelId,
    programId: structure.programId,
    studentType: structure.studentType,
    amountCents: structure.amountCents,
    isMandatory: structure.isMandatory,
    dueWithInstallment: structure.dueWithInstallment,
  }));
  const context = {
    gradeLevelId: request.gradeLevelId,
    programId: classroom?.programId ?? null,
    isReturning,
  };
  const optionalChoices = optionalFeeChoices(candidates, context);
  const allowedOptional = new Set(optionalChoices.map((choice) => choice.feeStructureId));
  const chosen = (request.optionalFeeStructureIds ?? []).filter((id) => allowedOptional.has(id));
  const lines = selectFeeLines(candidates, { ...context, optionalFeeStructureIds: chosen });

  const discountInputs: DiscountInput[] = [];
  if (request.discountPresetIds && request.discountPresetIds.length > 0) {
    const presets = await prisma.feeDiscountPreset.findMany({
      where: { id: { in: request.discountPresetIds }, isActive: true },
    });
    if (presets.length !== new Set(request.discountPresetIds).size) {
      throw new AppError(
        400,
        "DISCOUNT_PRESET_NOT_FOUND",
        "Une remise choisie n'existe pas ou n'est plus active",
      );
    }
    for (const preset of presets) {
      discountInputs.push({
        label: preset.name,
        kind: preset.kind,
        value: preset.value,
        presetId: preset.id,
      });
    }
  }
  for (const manual of request.manualDiscounts ?? []) {
    discountInputs.push({
      label: manual.label,
      kind: manual.kind,
      value: manual.value,
      reason: manual.reason,
    });
  }

  const installments = plan
    ? resolveInstallmentDates(
        plan.installments.map((rule) => ({
          sequence: rule.sequence,
          label: rule.label,
          shareBps: rule.shareBps,
          anchorType: rule.anchorType,
          academicPeriodId: rule.academicPeriodId,
          offsetDays: rule.offsetDays,
          fixedDate: rule.fixedDate,
        })),
        new Map(periods.map((period) => [period.id, period.startDate])),
        enrollmentDate,
      )
    : [];

  const schedule = buildSchedule({
    lines,
    installments,
    discounts: discountInputs,
    enrollmentDate,
    midYearPolicy: policy.midYearPolicy,
  });

  return {
    mode: plan ? "PLAN" : "LEGACY",
    isReturning,
    plan,
    lines,
    optionalChoices,
    discountInputs,
    schedule,
    policy,
  };
}

/** Photographie figée des lignes du contrat (JSON). */
export function agreementLinesJson(lines: FeeLine[]): Prisma.InputJsonValue {
  return lines.map((line) => ({
    feeStructureId: line.feeStructureId,
    feeCategoryId: line.feeCategoryId,
    label: line.label,
    nature: line.nature,
    amountCents: line.amountCents,
    isMandatory: line.isMandatory,
    dueWithInstallment: line.dueWithInstallment,
  }));
}
