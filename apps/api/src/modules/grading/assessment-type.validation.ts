import { z } from "zod";

export const createAssessmentTypeSchema = z.object({
  code: z.string().min(1),
  nameFr: z.string().min(1),
  nameEn: z.string().min(1),
});
export type CreateAssessmentTypeInput = z.infer<typeof createAssessmentTypeSchema>;
