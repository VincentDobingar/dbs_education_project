import { z } from "zod";

export const createEducationCycleSchema = z.object({
  code: z.string().min(1),
  nameFr: z.string().min(1),
  nameEn: z.string().min(1),
  order: z.number().int().nonnegative(),
});
export type CreateEducationCycleInput = z.infer<typeof createEducationCycleSchema>;

export const createGradeLevelSchema = z.object({
  code: z.string().min(1),
  nameFr: z.string().min(1),
  nameEn: z.string().min(1),
  order: z.number().int().nonnegative(),
});
export type CreateGradeLevelInput = z.infer<typeof createGradeLevelSchema>;

export const createClassroomSchema = z.object({
  name: z.string().min(1),
  academicYearId: z.string().min(1),
  campusId: z.string().min(1),
  gradeLevelId: z.string().min(1),
  programId: z.string().min(1).optional(),
  capacity: z.number().int().positive().optional(),
  mainTeacherId: z.string().min(1).optional(),
});
export type CreateClassroomInput = z.infer<typeof createClassroomSchema>;

export const updateClassroomSchema = z.object({
  name: z.string().min(1).optional(),
  capacity: z.number().int().positive().optional(),
  mainTeacherId: z.string().min(1).optional(),
});
export type UpdateClassroomInput = z.infer<typeof updateClassroomSchema>;
