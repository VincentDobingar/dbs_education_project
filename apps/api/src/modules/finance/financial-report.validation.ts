import { z } from "zod";

export const financialReportQuerySchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((query) => query.endDate >= query.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });
export type FinancialReportQuery = z.infer<typeof financialReportQuerySchema>;
