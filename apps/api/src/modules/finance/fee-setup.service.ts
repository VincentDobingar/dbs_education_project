import type { FeeDiscountPreset, FeePlan, FeePlanInstallment } from "@prisma/client";
import type { z } from "zod";

import { AppError } from "../../lib/errors.js";
import { prisma, withTenantSession } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import { validatePlanShares } from "./fee-schedule/engine.js";
import type {
  FeePlanInput,
  FeePolicy,
  copyFeeSetupSchema,
  discountPresetSchema,
  updateDiscountPresetSchema,
} from "./fee-setup.validation.js";

// ------------------------------------------------------------------ politique

const POLICY_KEY = "finance.feePolicy";

/**
 * Valeurs par défaut prudentes : rien ne pénalise l'élève tant que la direction ne
 * l'a pas activé (retenue du bulletin, pénalités, blocage de la réinscription).
 */
export const DEFAULT_FEE_POLICY: FeePolicy = {
  midYearPolicy: "GROUP",
  reenrollmentWithArrears: "ALLOW",
  withholdReportCards: false,
  withholdAfterDays: 15,
  remindersEnabled: true,
  reminderDaysBefore: 3,
  reminderDaysAfter: 1,
  longOverdueDays: 15,
  penaltyEnabled: false,
  penaltyKind: "AMOUNT",
  penaltyValue: 0,
  penaltyAfterDays: 15,
  onlinePaymentEnabled: false,
};

export async function getFeePolicy(tenantId: string): Promise<FeePolicy> {
  const row = await withTenantSession(tenantId, (tx) =>
    tx.tenantSetting.findUnique({ where: { tenantId_key: { tenantId, key: POLICY_KEY } } }),
  );
  const stored = (row?.value ?? {}) as Partial<FeePolicy>;
  const merged = { ...DEFAULT_FEE_POLICY };
  for (const key of Object.keys(DEFAULT_FEE_POLICY) as (keyof FeePolicy)[]) {
    const value = stored[key];
    if (value !== undefined && typeof value === typeof DEFAULT_FEE_POLICY[key]) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
}

export async function updateFeePolicy(input: FeePolicy, userId: string): Promise<FeePolicy> {
  const tenantId = requireCurrentTenantId();
  await withTenantSession(tenantId, (tx) =>
    tx.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: POLICY_KEY } },
      create: { tenantId, key: POLICY_KEY, value: input, updatedById: userId },
      update: { value: input, updatedById: userId },
    }),
  );
  return input;
}

// ------------------------------------------------------------------ plans

export type FeePlanWithInstallments = FeePlan & { installments: FeePlanInstallment[] };

export async function listFeePlans(academicYearId?: string): Promise<FeePlanWithInstallments[]> {
  return prisma.feePlan.findMany({
    where: academicYearId ? { academicYearId } : {},
    include: { installments: { orderBy: { sequence: "asc" } } },
    orderBy: [{ academicYearId: "asc" }, { name: "asc" }],
  });
}

async function assertPlanReferences(input: FeePlanInput, excludePlanId?: string): Promise<void> {
  const year = await prisma.academicYear.findUnique({ where: { id: input.academicYearId } });
  if (!year || year.deletedAt)
    throw new AppError(404, "ACADEMIC_YEAR_NOT_FOUND", "Année scolaire introuvable");
  if (input.educationCycleId) {
    const cycle = await prisma.educationCycle.findUnique({ where: { id: input.educationCycleId } });
    if (!cycle) throw new AppError(404, "EDUCATION_CYCLE_NOT_FOUND", "Cycle introuvable");
  }
  const shareError = validatePlanShares(
    input.installments.map((rule, index) => ({ sequence: index + 1, shareBps: rule.shareBps })),
  );
  if (shareError) {
    throw new AppError(400, shareError, "Les parts des tranches doivent totaliser 100 %");
  }
  const periodIds = [
    ...new Set(
      input.installments.map((rule) => rule.academicPeriodId).filter((id): id is string => Boolean(id)),
    ),
  ];
  if (periodIds.length > 0) {
    const periods = await prisma.academicPeriod.findMany({ where: { id: { in: periodIds } } });
    if (
      periods.length !== periodIds.length ||
      periods.some((p) => p.academicYearId !== input.academicYearId)
    ) {
      throw new AppError(400, "PLAN_PERIOD_MISMATCH", "Chaque période doit appartenir à l'année du plan");
    }
  }
  // Un seul plan par année et par cycle (le plan général a un cycle nul).
  const clash = await prisma.feePlan.findFirst({
    where: {
      academicYearId: input.academicYearId,
      educationCycleId: input.educationCycleId ?? null,
      ...(excludePlanId ? { id: { not: excludePlanId } } : {}),
    },
  });
  if (clash) {
    throw new AppError(
      409,
      "FEE_PLAN_ALREADY_DEFINED",
      input.educationCycleId
        ? "Ce cycle a déjà un plan d'échéances pour cette année"
        : "Le plan général de cette année existe déjà",
    );
  }
}

function installmentRows(tenantId: string, planId: string, input: FeePlanInput) {
  return input.installments.map((rule, index) => ({
    tenantId,
    feePlanId: planId,
    sequence: index + 1,
    label: rule.label,
    shareBps: rule.shareBps,
    anchorType: rule.anchorType,
    academicPeriodId: rule.anchorType === "PERIOD_START" ? (rule.academicPeriodId ?? null) : null,
    offsetDays: rule.offsetDays,
    fixedDate: rule.anchorType === "FIXED_DATE" ? (rule.fixedDate ?? null) : null,
  }));
}

export async function createFeePlan(input: FeePlanInput): Promise<FeePlanWithInstallments> {
  await assertPlanReferences(input);
  const tenantId = requireCurrentTenantId();
  return withTenantSession(tenantId, async (tx) => {
    const plan = await tx.feePlan.create({
      data: {
        tenantId,
        academicYearId: input.academicYearId,
        educationCycleId: input.educationCycleId ?? null,
        name: input.name,
      },
    });
    await tx.feePlanInstallment.createMany({ data: installmentRows(tenantId, plan.id, input) });
    return tx.feePlan.findUniqueOrThrow({
      where: { id: plan.id },
      include: { installments: { orderBy: { sequence: "asc" } } },
    });
  });
}

/** Modifier un plan ne touche aucun contrat déjà signé : ils gardent leurs échéances. */
export async function updateFeePlan(id: string, input: FeePlanInput): Promise<FeePlanWithInstallments> {
  const existing = await prisma.feePlan.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "FEE_PLAN_NOT_FOUND", "Plan introuvable");
  if (existing.academicYearId !== input.academicYearId) {
    throw new AppError(400, "FEE_PLAN_YEAR_IMMUTABLE", "L'année d'un plan ne peut pas changer");
  }
  await assertPlanReferences(input, id);
  const tenantId = requireCurrentTenantId();
  return withTenantSession(tenantId, async (tx) => {
    await tx.feePlan.update({
      where: { id },
      data: { name: input.name, educationCycleId: input.educationCycleId ?? null },
    });
    await tx.feePlanInstallment.deleteMany({ where: { feePlanId: id } });
    await tx.feePlanInstallment.createMany({ data: installmentRows(tenantId, id, input) });
    return tx.feePlan.findUniqueOrThrow({
      where: { id },
      include: { installments: { orderBy: { sequence: "asc" } } },
    });
  });
}

export async function deleteFeePlan(id: string): Promise<void> {
  const plan = await prisma.feePlan.findUnique({ where: { id } });
  if (!plan) throw new AppError(404, "FEE_PLAN_NOT_FOUND", "Plan introuvable");
  const used = await prisma.studentFeeAgreement.count({ where: { feePlanId: id } });
  if (used > 0) {
    throw new AppError(
      409,
      "FEE_PLAN_IN_USE",
      "Ce plan a déjà servi à des inscriptions : modifiez-le plutôt",
    );
  }
  await prisma.feePlan.delete({ where: { id } });
}

/**
 * Duplique le paramétrage d'une année sur une autre : grille tarifaire et plans.
 * Les tranches ancrées sur une période sont rattachées à la période de même rang
 * de la nouvelle année ; une date fixe est décalée d'un an.
 */
export async function copyFeeSetup(
  input: z.infer<typeof copyFeeSetupSchema>,
): Promise<{ plans: number; feeStructures: number }> {
  if (input.fromAcademicYearId === input.toAcademicYearId) {
    throw new AppError(400, "SAME_ACADEMIC_YEAR", "Choisissez deux années différentes");
  }
  const [from, to] = await Promise.all([
    prisma.academicYear.findUnique({ where: { id: input.fromAcademicYearId } }),
    prisma.academicYear.findUnique({ where: { id: input.toAcademicYearId } }),
  ]);
  if (!from || !to) throw new AppError(404, "ACADEMIC_YEAR_NOT_FOUND", "Année scolaire introuvable");
  const already = await prisma.feePlan.count({ where: { academicYearId: to.id } });
  const alreadyFees = await prisma.feeStructure.count({ where: { academicYearId: to.id } });
  if (already > 0 || alreadyFees > 0) {
    throw new AppError(409, "FEE_SETUP_NOT_EMPTY", "La nouvelle année a déjà des tarifs ou des plans");
  }
  const [plans, structures, fromPeriods, toPeriods] = await Promise.all([
    listFeePlans(from.id),
    prisma.feeStructure.findMany({ where: { academicYearId: from.id } }),
    prisma.academicPeriod.findMany({ where: { academicYearId: from.id } }),
    prisma.academicPeriod.findMany({ where: { academicYearId: to.id } }),
  ]);
  const sequenceByPeriod = new Map(fromPeriods.map((p) => [p.id, p.sequence]));
  const periodBySequence = new Map(toPeriods.map((p) => [p.sequence, p.id]));
  const tenantId = requireCurrentTenantId();
  return withTenantSession(tenantId, async (tx) => {
    for (const plan of plans) {
      const created = await tx.feePlan.create({
        data: { tenantId, academicYearId: to.id, educationCycleId: plan.educationCycleId, name: plan.name },
      });
      await tx.feePlanInstallment.createMany({
        data: plan.installments.map((rule) => {
          let anchorType = rule.anchorType;
          let academicPeriodId: string | null = null;
          let fixedDate: Date | null = null;
          if (rule.anchorType === "PERIOD_START") {
            const sequence = rule.academicPeriodId ? sequenceByPeriod.get(rule.academicPeriodId) : undefined;
            academicPeriodId = sequence !== undefined ? (periodBySequence.get(sequence) ?? null) : null;
            if (!academicPeriodId) anchorType = "ENROLLMENT";
          } else if (rule.anchorType === "FIXED_DATE" && rule.fixedDate) {
            fixedDate = new Date(rule.fixedDate);
            fixedDate.setUTCFullYear(fixedDate.getUTCFullYear() + 1);
          }
          return {
            tenantId,
            feePlanId: created.id,
            sequence: rule.sequence,
            label: rule.label,
            shareBps: rule.shareBps,
            anchorType,
            academicPeriodId,
            offsetDays: rule.offsetDays,
            fixedDate,
          };
        }),
      });
    }
    if (structures.length > 0) {
      await tx.feeStructure.createMany({
        data: structures.map((structure) => ({
          tenantId,
          academicYearId: to.id,
          gradeLevelId: structure.gradeLevelId,
          programId: structure.programId,
          feeCategoryId: structure.feeCategoryId,
          amountCents: structure.amountCents,
          isMandatory: structure.isMandatory,
          studentType: structure.studentType,
          dueWithInstallment: structure.dueWithInstallment,
        })),
      });
    }
    return { plans: plans.length, feeStructures: structures.length };
  });
}

// ------------------------------------------------------------------ remises

export async function listDiscountPresets(): Promise<FeeDiscountPreset[]> {
  return prisma.feeDiscountPreset.findMany({ orderBy: { name: "asc" } });
}

export async function createDiscountPreset(
  input: z.infer<typeof discountPresetSchema>,
): Promise<FeeDiscountPreset> {
  const clash = await prisma.feeDiscountPreset.findFirst({ where: { name: input.name } });
  if (clash) throw new AppError(409, "DISCOUNT_PRESET_EXISTS", "Une remise porte déjà ce nom");
  return prisma.feeDiscountPreset.create({
    data: {
      tenantId: requireCurrentTenantId(),
      name: input.name,
      kind: input.kind,
      value: input.value,
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateDiscountPreset(
  id: string,
  input: z.infer<typeof updateDiscountPresetSchema>,
): Promise<FeeDiscountPreset> {
  const preset = await prisma.feeDiscountPreset.findUnique({ where: { id } });
  if (!preset) throw new AppError(404, "DISCOUNT_PRESET_NOT_FOUND", "Remise introuvable");
  return prisma.feeDiscountPreset.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}
