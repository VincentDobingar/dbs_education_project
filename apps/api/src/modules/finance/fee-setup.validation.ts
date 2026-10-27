import { z } from "zod";

export const feePolicySchema = z.object({
  /** Inscription en cours d'année : regrouper les tranches échues, ou ne facturer que la suite. */
  midYearPolicy: z.enum(["GROUP", "PRORATA"]),
  /** Réinscription d'un élève qui a des arriérés d'une année précédente. */
  reenrollmentWithArrears: z.enum(["ALLOW", "BLOCK"]),
  /** Retenue du bulletin dans les portails parent et élève quand une échéance est en retard. */
  withholdReportCards: z.boolean(),
  withholdAfterDays: z.number().int().min(0).max(180),
  remindersEnabled: z.boolean(),
  reminderDaysBefore: z.number().int().min(0).max(30),
  reminderDaysAfter: z.number().int().min(0).max(30),
  longOverdueDays: z.number().int().min(1).max(180),
  penaltyEnabled: z.boolean(),
  penaltyKind: z.enum(["AMOUNT", "PERCENT"]),
  /** Centimes (AMOUNT) ou points de base (PERCENT, 10 000 = 100 %). */
  penaltyValue: z.number().int().min(0).max(2_000_000_000),
  penaltyAfterDays: z.number().int().min(1).max(180),
  /** Paiement en ligne des échéances depuis le portail parent (Konoom…), encaissé par DBSA puis reversé. */
  onlinePaymentEnabled: z.boolean(),
});
export type FeePolicy = z.infer<typeof feePolicySchema>;

const installmentRuleSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    shareBps: z.number().int().min(1).max(10_000),
    anchorType: z.enum(["ENROLLMENT", "PERIOD_START", "FIXED_DATE"]),
    academicPeriodId: z.string().min(1).nullable().optional(),
    offsetDays: z.number().int().min(-60).max(180).default(0),
    fixedDate: z.coerce.date().nullable().optional(),
  })
  .refine((rule) => rule.anchorType !== "PERIOD_START" || Boolean(rule.academicPeriodId), {
    message: "Choisissez la période scolaire de cette tranche",
    path: ["academicPeriodId"],
  })
  .refine((rule) => rule.anchorType !== "FIXED_DATE" || Boolean(rule.fixedDate), {
    message: "Indiquez la date de cette tranche",
    path: ["fixedDate"],
  });

export const feePlanSchema = z.object({
  academicYearId: z.string().min(1),
  educationCycleId: z.string().min(1).nullable().optional(),
  name: z.string().trim().min(1).max(100),
  installments: z.array(installmentRuleSchema).min(1).max(12),
});
export type FeePlanInput = z.infer<typeof feePlanSchema>;

export const copyFeeSetupSchema = z.object({
  fromAcademicYearId: z.string().min(1),
  toAcademicYearId: z.string().min(1),
});

export const discountPresetSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(["PERCENT", "AMOUNT"]),
    value: z.number().int().positive().max(2_000_000_000),
    isActive: z.boolean().optional(),
  })
  .refine((preset) => preset.kind !== "PERCENT" || preset.value <= 10_000, {
    message: "Un pourcentage ne peut pas dépasser 100 %",
    path: ["value"],
  });
export const updateDiscountPresetSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
});
