import { z } from "zod";

import { httpUrlSchema } from "../../lib/http-url-schema.js";

export const createStudentSchema = z.object({
  primaryGuardianId: z.string().min(1).optional(),
  matricule: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.string().min(1).optional(),
  photoUrl: httpUrlSchema.optional(),
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
  matricule: z.string().trim().min(1).max(80).optional(),
  address: z.string().trim().max(240).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  birthPlace: z.string().trim().max(120).nullable().optional(),
  nationality: z.string().trim().max(80).nullable().optional(),
  primaryGuardianId: z.string().min(1).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  dateOfBirth: z.coerce.date().nullable().optional(),
  gender: z.string().trim().max(40).nullable().optional(),
  photoUrl: httpUrlSchema.optional(),
  emergencyContactName: z.string().trim().max(120).nullable().optional(),
  emergencyContactPhone: z.string().trim().max(40).nullable().optional(),
  medicalNotes: z.string().min(1).optional(),
  status: z.enum(STUDENT_STATUSES).optional(),
});
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;

export const listStudentsQuerySchema = z.object({
  classroomId: z.string().min(1).optional(),
  // Pagination opt-in (jamais un défaut qui romprait les appelants existants —
  // roster de classe pour l'appel, note bulletin, discipline, devoirs — qui
  // attendent tous un tableau complet, jamais tronqué silencieusement). Sans
  // `page`, le comportement reste inchangé : tout renvoyer. Avec `page`, le
  // contrôleur bascule vers une réponse paginée `{ data, total }`.
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;

export const checkDuplicateStudentsQuerySchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z.coerce.date().optional(),
});
export type CheckDuplicateStudentsQuery = z.infer<typeof checkDuplicateStudentsQuerySchema>;
