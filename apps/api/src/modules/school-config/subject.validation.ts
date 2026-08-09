import { z } from "zod";

export const createDepartmentSchema = z.object({
  code: z.string().min(1),
  nameFr: z.string().min(1),
  nameEn: z.string().min(1),
  headEmployeeId: z.string().min(1).optional(),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;

export const createSubjectSchema = z.object({
  code: z.string().min(1),
  nameFr: z.string().min(1),
  nameEn: z.string().min(1),
  departmentId: z.string().min(1).optional(),
});
export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;

export const updateSubjectSchema = z.object({
  nameFr: z.string().min(1).optional(),
  nameEn: z.string().min(1).optional(),
  departmentId: z.string().min(1).optional(),
});
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;
