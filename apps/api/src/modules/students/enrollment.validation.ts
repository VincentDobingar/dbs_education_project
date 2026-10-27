import { z } from "zod";

export const createEnrollmentSchema = z.object({
  registrationPeriodId: z.string().min(1),
  academicYearId: z.string().min(1),
  classroomId: z.string().min(1),
  campusId: z.string().min(1),
  gradeLevelId: z.string().min(1),
  /** Tarifs facultatifs choisis (cantine, transport…). */
  optionalFeeStructureIds: z.array(z.string().min(1)).max(30).optional(),
  /** Remises prédéfinies par l'établissement. */
  discountPresetIds: z.array(z.string().min(1)).max(10).optional(),
  /** Remises accordées au cas par cas : réservées à la direction (finance.exceptions), motif obligatoire. */
  manualDiscounts: z
    .array(
      z
        .object({
          label: z.string().trim().min(1).max(80),
          kind: z.enum(["PERCENT", "AMOUNT"]),
          value: z.number().int().positive().max(2_000_000_000),
          reason: z.string().trim().min(3).max(300),
        })
        .refine((discount) => discount.kind !== "PERCENT" || discount.value <= 10_000, {
          message: "Un pourcentage ne peut pas dépasser 100 %",
          path: ["value"],
        }),
    )
    .max(5)
    .optional(),
});
export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;

const ENROLLMENT_STATUSES = [
  "PRE_REGISTERED",
  "ADMITTED",
  "ENROLLED",
  "RE_ENROLLED",
  "TRANSFERRED_OUT",
  "WITHDRAWN",
  "GRADUATED",
] as const;

export const updateEnrollmentStatusSchema = z.object({
  status: z.enum(ENROLLMENT_STATUSES),
});
export type UpdateEnrollmentStatusInput = z.infer<typeof updateEnrollmentStatusSchema>;
