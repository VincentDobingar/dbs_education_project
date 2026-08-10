import { z } from "zod";

export const createTeacherAssignmentSchema = z.object({
  employeeId: z.string().min(1),
  subjectId: z.string().min(1),
  classroomId: z.string().min(1),
  academicYearId: z.string().min(1),
  hoursPerWeek: z.coerce.number().positive().optional(),
});
export type CreateTeacherAssignmentInput = z.infer<typeof createTeacherAssignmentSchema>;

export const listTeacherAssignmentsQuerySchema = z.object({
  classroomId: z.string().min(1).optional(),
  employeeId: z.string().min(1).optional(),
  academicYearId: z.string().min(1).optional(),
});
export type ListTeacherAssignmentsQuery = z.infer<typeof listTeacherAssignmentsQuerySchema>;
