import { z } from "zod";

export const createPerformanceEvaluationSchema = z
  .object({
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
    score: z.coerce.number().int().optional(),
    comments: z.string().optional(),
  })
  .refine((data) => data.periodEnd >= data.periodStart, {
    message: "periodEnd must be on or after periodStart",
    path: ["periodEnd"],
  });
export type CreatePerformanceEvaluationInput = z.infer<typeof createPerformanceEvaluationSchema>;
