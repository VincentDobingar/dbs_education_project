import { z } from "zod";

export const createStudentSchema = z.object({
  matricule: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.string().min(1).optional(),
  photoUrl: z.string().min(1).optional(),
  emergencyContactName: z.string().min(1).optional(),
  emergencyContactPhone: z.string().min(1).optional(),
  medicalNotes: z.string().min(1).optional(),
});
export type CreateStudentInput = z.infer<typeof createStudentSchema>;

const STUDENT_STATUSES = [
  "PROSPECTIVE",
  "ACTIVE",
  "TRANSFERRED",
  "GRADUATED",
  "WITHDRAWN",
  "ARCHIVED",
] as const;

export const updateStudentSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.string().min(1).optional(),
  photoUrl: z.string().min(1).optional(),
  emergencyContactName: z.string().min(1).optional(),
  emergencyContactPhone: z.string().min(1).optional(),
  medicalNotes: z.string().min(1).optional(),
  status: z.enum(STUDENT_STATUSES).optional(),
});
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
