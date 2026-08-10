import { z } from "zod";

export const setSubjectCoefficientSchema = z.object({
  gradeLevelId: z.string().min(1),
  coefficient: z.coerce.number().positive(),
});
export type SetSubjectCoefficientInput = z.infer<typeof setSubjectCoefficientSchema>;
