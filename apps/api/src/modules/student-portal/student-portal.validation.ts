import { z } from "zod";

export const listMyReportCardsQuerySchema = z.object({
  classroomId: z.string().min(1).optional(),
  academicPeriodId: z.string().min(1).optional(),
});
export type ListMyReportCardsQuery = z.infer<typeof listMyReportCardsQuerySchema>;
