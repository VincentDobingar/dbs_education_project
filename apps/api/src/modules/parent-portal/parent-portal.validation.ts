import { z } from "zod";

export const listChildAttendanceQuerySchema = z.object({
  classroomId: z.string().min(1).optional(),
  date: z.coerce.date().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});
export type ListChildAttendanceQuery = z.infer<typeof listChildAttendanceQuerySchema>;

export const listChildReportCardsQuerySchema = z.object({
  classroomId: z.string().min(1).optional(),
  academicPeriodId: z.string().min(1).optional(),
});
export type ListChildReportCardsQuery = z.infer<typeof listChildReportCardsQuerySchema>;
