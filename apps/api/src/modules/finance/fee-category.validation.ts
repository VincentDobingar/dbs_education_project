import { z } from "zod";

export const createFeeCategorySchema = z.object({
  code: z.string().min(1),
  nameFr: z.string().min(1),
  nameEn: z.string().min(1),
});
export type CreateFeeCategoryInput = z.infer<typeof createFeeCategorySchema>;
