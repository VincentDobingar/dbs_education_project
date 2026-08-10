import { z } from "zod";

export const generateReportCardsSchema = z.object({
  classroomId: z.string().min(1),
  academicPeriodId: z.string().min(1),
});
export type GenerateReportCardsInput = z.infer<typeof generateReportCardsSchema>;

export const listReportCardsQuerySchema = z.object({
  classroomId: z.string().min(1).optional(),
  academicPeriodId: z.string().min(1).optional(),
  studentId: z.string().min(1).optional(),
});
export type ListReportCardsQuery = z.infer<typeof listReportCardsQuerySchema>;
