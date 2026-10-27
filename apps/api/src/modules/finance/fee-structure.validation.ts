import { z } from "zod";

const STUDENT_TYPES = ["ALL", "NEW", "RETURNING"] as const;

export const createFeeStructureSchema = z.object({
  academicYearId: z.string().min(1),
  gradeLevelId: z.string().min(1).optional(),
  programId: z.string().min(1).optional(),
  feeCategoryId: z.string().min(1),
  amountCents: z.number().int().positive().max(2_000_000_000),
  dueDate: z.coerce.date().optional(),
  isMandatory: z.boolean().optional(),
  studentType: z.enum(STUDENT_TYPES).optional(),
  dueWithInstallment: z.number().int().min(1).max(12).optional(),
});
export type CreateFeeStructureInput = z.infer<typeof createFeeStructureSchema>;

export const updateFeeStructureSchema = z.object({
  amountCents: z.number().int().positive().max(2_000_000_000).optional(),
  dueDate: z.coerce.date().optional(),
  isMandatory: z.boolean().optional(),
  studentType: z.enum(STUDENT_TYPES).optional(),
  dueWithInstallment: z.number().int().min(1).max(12).nullable().optional(),
});
export type UpdateFeeStructureInput = z.infer<typeof updateFeeStructureSchema>;

export const listFeeStructuresQuerySchema = z.object({
  academicYearId: z.string().min(1).optional(),
  gradeLevelId: z.string().min(1).optional(),
  feeCategoryId: z.string().min(1).optional(),
});
export type ListFeeStructuresQuery = z.infer<typeof listFeeStructuresQuerySchema>;
