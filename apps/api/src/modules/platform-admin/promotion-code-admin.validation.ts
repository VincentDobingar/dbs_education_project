import { z } from "zod";

const SUBSCRIBER_CATEGORIES = ["SCHOOL", "PARENT", "STUDENT", "ORGANIZATION"] as const;
const PROMOTION_DISCOUNT_TYPES = ["PERCENTAGE", "FIXED_AMOUNT"] as const;

function refineDiscountValue<
  T extends { discountType?: string | undefined; discountValue?: number | undefined },
>(data: T): boolean {
  if (data.discountType === "PERCENTAGE" && data.discountValue !== undefined) {
    return data.discountValue <= 100;
  }
  return true;
}

function refineDateRange<T extends { startsAt?: Date | undefined; endsAt?: Date | undefined }>(
  data: T,
): boolean {
  if (data.startsAt && data.endsAt) {
    return data.endsAt > data.startsAt;
  }
  return true;
}

export const createPromotionCodeSchema = z
  .object({
    code: z.string().min(1),
    descriptionFr: z.string().optional(),
    descriptionEn: z.string().optional(),
    discountType: z.enum(PROMOTION_DISCOUNT_TYPES),
    discountValue: z.coerce.number().positive(),
    applicableCategory: z.enum(SUBSCRIBER_CATEGORIES).optional(),
    maxRedemptions: z.coerce.number().int().positive().optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    justification: z.string().optional(),
  })
  .refine(refineDiscountValue, {
    message: "A percentage discount cannot exceed 100",
    path: ["discountValue"],
  })
  .refine(refineDateRange, {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });
export type CreatePromotionCodeInput = z.infer<typeof createPromotionCodeSchema>;

export const updatePromotionCodeSchema = z
  .object({
    descriptionFr: z.string().optional(),
    descriptionEn: z.string().optional(),
    discountType: z.enum(PROMOTION_DISCOUNT_TYPES).optional(),
    discountValue: z.coerce.number().positive().optional(),
    applicableCategory: z.enum(SUBSCRIBER_CATEGORIES).optional(),
    maxRedemptions: z.coerce.number().int().positive().optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    isActive: z.boolean().optional(),
    justification: z.string().optional(),
  })
  .refine(refineDiscountValue, {
    message: "A percentage discount cannot exceed 100",
    path: ["discountValue"],
  })
  .refine(refineDateRange, {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });
export type UpdatePromotionCodeInput = z.infer<typeof updatePromotionCodeSchema>;

export const listPromotionCodesQuerySchema = z.object({
  isActive: z.coerce.boolean().optional(),
});
export type ListPromotionCodesQuery = z.infer<typeof listPromotionCodesQuerySchema>;
