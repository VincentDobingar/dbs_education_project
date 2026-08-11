import { z } from "zod";

export const createExpenseCategorySchema = z.object({
  code: z.string().min(1),
  nameFr: z.string().min(1),
  nameEn: z.string().min(1),
});
export type CreateExpenseCategoryInput = z.infer<typeof createExpenseCategorySchema>;
