import { z } from "zod";

/**
 * The only Student fields a transfer may carry to the destination tenant (§10 —
 * a change of school must never move confidential data automatically). firstName
 * and lastName are copied unconditionally (bare identity, not "confidential"), and
 * matricule is always assigned fresh by the destination — neither belongs here.
 */
export const TRANSFERABLE_STUDENT_FIELDS = [
  "dateOfBirth",
  "gender",
  "photoUrl",
  "emergencyContactName",
  "emergencyContactPhone",
  "medicalNotes",
] as const;
export type TransferableStudentField = (typeof TRANSFERABLE_STUDENT_FIELDS)[number];

export const requestStudentTransferSchema = z.object({
  studentId: z.string().min(1),
  toTenantSubdomain: z.string().min(1),
  dataScope: z.array(z.enum(TRANSFERABLE_STUDENT_FIELDS)).default([]),
});
export type RequestStudentTransferInput = z.infer<typeof requestStudentTransferSchema>;

export const completeStudentTransferSchema = z.object({
  matricule: z.string().min(1),
});
export type CompleteStudentTransferInput = z.infer<typeof completeStudentTransferSchema>;
