import { z } from "zod";

export const createFeeStructureSchema = z.object({
  academicYearId: z.string().min(1),
  gradeLevelId: z.string().min(1).optional(),
  feeCategoryId: z.string().min(1),
  amountCents: z.number().int().positive(),
  dueDate: z.coerce.date().optional(),
  isMandatory: z.boolean().optional(),
});
export type CreateFeeStructureInput = z.infer<typeof createFeeStructureSchema>;

export const updateFeeStructureSchema = z.object({
  amountCents: z.number().int().positive().optional(),
  dueDate: z.coerce.date().optional(),
  isMandatory: z.boolean().optional(),
});
export type UpdateFeeStructureInput = z.infer<typeof updateFeeStructureSchema>;

export const listFeeStructuresQuerySchema = z.object({
  academicYearId: z.string().min(1).optional(),
  gradeLevelId: z.string().min(1).optional(),
  feeCategoryId: z.string().min(1).optional(),
});
export type ListFeeStructuresQuery = z.infer<typeof listFeeStructuresQuerySchema>;
