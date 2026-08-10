import { z } from "zod";

export const createAssessmentSchema = z.object({
  subjectId: z.string().min(1),
  classroomId: z.string().min(1),
  assessmentTypeId: z.string().min(1),
  academicPeriodId: z.string().min(1),
  title: z.string().min(1),
  maxScore: z.coerce.number().positive(),
  coefficient: z.coerce.number().positive().optional(),
  scheduledAt: z.coerce.date().optional(),
});
export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;

export const updateAssessmentSchema = z.object({
  title: z.string().min(1).optional(),
  maxScore: z.coerce.number().positive().optional(),
  coefficient: z.coerce.number().positive().optional(),
  scheduledAt: z.coerce.date().optional(),
});
export type UpdateAssessmentInput = z.infer<typeof updateAssessmentSchema>;

export const listAssessmentsQuerySchema = z.object({
  classroomId: z.string().min(1).optional(),
  subjectId: z.string().min(1).optional(),
  academicPeriodId: z.string().min(1).optional(),
});
export type ListAssessmentsQuery = z.infer<typeof listAssessmentsQuerySchema>;
