import { z } from "zod";

export const createFamilyAccountSchema = z.object({
  maxChildren: z.number().int().positive().optional(),
});
export type CreateFamilyAccountInput = z.infer<typeof createFamilyAccountSchema>;

export const updateFamilyAccountSchema = z.object({
  maxChildren: z.number().int().positive().nullable().optional(),
});
export type UpdateFamilyAccountInput = z.infer<typeof updateFamilyAccountSchema>;
