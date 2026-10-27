import { z } from "zod";

export const FEE_NATURES = ["REGISTRATION", "TUITION", "ANNEX", "EXAM"] as const;

export const createFeeCategorySchema = z.object({
  code: z.string().trim().min(1).max(40),
  nameFr: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  nature: z.enum(FEE_NATURES).optional(),
  isRefundable: z.boolean().optional(),
});
export type CreateFeeCategoryInput = z.infer<typeof createFeeCategorySchema>;

export const updateFeeCategorySchema = z.object({
  nameFr: z.string().trim().min(1).max(120).optional(),
  nameEn: z.string().trim().min(1).max(120).optional(),
  nature: z.enum(FEE_NATURES).optional(),
  isRefundable: z.boolean().optional(),
});
export type UpdateFeeCategoryInput = z.infer<typeof updateFeeCategorySchema>;
