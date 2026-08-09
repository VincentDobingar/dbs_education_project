import { z } from "zod";

export const createEnrollmentSchema = z.object({
  academicYearId: z.string().min(1),
  classroomId: z.string().min(1),
  campusId: z.string().min(1),
  gradeLevelId: z.string().min(1),
});
export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;

const ENROLLMENT_STATUSES = [
  "PRE_REGISTERED",
  "ADMITTED",
  "ENROLLED",
  "RE_ENROLLED",
  "TRANSFERRED_OUT",
  "WITHDRAWN",
  "GRADUATED",
] as const;

export const updateEnrollmentStatusSchema = z.object({
  status: z.enum(ENROLLMENT_STATUSES),
});
export type UpdateEnrollmentStatusInput = z.infer<typeof updateEnrollmentStatusSchema>;
