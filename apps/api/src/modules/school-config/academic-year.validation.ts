import { z } from "zod";

export const createAcademicYearSchema = z.object({
  name: z.string().min(2),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});
export type CreateAcademicYearInput = z.infer<typeof createAcademicYearSchema>;

export const updateAcademicYearSchema = z.object({
  name: z.string().min(2).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});
export type UpdateAcademicYearInput = z.infer<typeof updateAcademicYearSchema>;

const PERIOD_TYPES = ["TRIMESTER", "SEMESTER", "CUSTOM"] as const;

export const createAcademicPeriodSchema = z.object({
  name: z.string().min(2),
  type: z.enum(PERIOD_TYPES),
  sequence: z.number().int().positive(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});
export type CreateAcademicPeriodInput = z.infer<typeof createAcademicPeriodSchema>;
