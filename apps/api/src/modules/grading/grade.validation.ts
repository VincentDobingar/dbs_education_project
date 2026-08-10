import { z } from "zod";

const gradeEntrySchema = z
  .object({
    studentId: z.string().min(1),
    score: z.coerce.number().nonnegative().optional(),
    isAbsent: z.boolean().optional().default(false),
    comment: z.string().min(1).optional(),
  })
  .refine((data) => data.isAbsent || data.score !== undefined, {
    message: "score is required unless isAbsent is true",
    path: ["score"],
  });

export const setGradesSchema = z.object({
  grades: z.array(gradeEntrySchema).min(1),
});
export type SetGradesInput = z.infer<typeof setGradesSchema>;

export const correctGradeSchema = z
  .object({
    score: z.coerce.number().nonnegative().optional(),
    isAbsent: z.boolean().optional(),
    reason: z.string().min(1),
  })
  .refine((data) => data.score !== undefined || data.isAbsent !== undefined, {
    message: "score or isAbsent must be provided",
    path: ["score"],
  });
export type CorrectGradeInput = z.infer<typeof correctGradeSchema>;

export const listStudentGradesQuerySchema = z.object({
  academicPeriodId: z.string().min(1).optional(),
});
export type ListStudentGradesQuery = z.infer<typeof listStudentGradesQuerySchema>;
