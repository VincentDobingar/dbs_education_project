import { z } from "zod";

export const createProgramSchema = z.object({
  code: z.string().min(1),
  nameFr: z.string().min(1),
  nameEn: z.string().min(1),
  gradeLevelId: z.string().min(1).optional(),
});
export type CreateProgramInput = z.infer<typeof createProgramSchema>;

export const updateProgramSchema = z.object({
  nameFr: z.string().min(1).optional(),
  nameEn: z.string().min(1).optional(),
  gradeLevelId: z.string().min(1).optional(),
});
export type UpdateProgramInput = z.infer<typeof updateProgramSchema>;

export const listProgramsQuerySchema = z.object({
  gradeLevelId: z.string().min(1).optional(),
});
export type ListProgramsQuery = z.infer<typeof listProgramsQuerySchema>;
