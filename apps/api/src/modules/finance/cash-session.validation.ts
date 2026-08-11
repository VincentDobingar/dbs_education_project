import { z } from "zod";

export const openCashSessionSchema = z.object({
  campusId: z.string().min(1).optional(),
  openingBalanceCents: z.number().int().nonnegative(),
});
export type OpenCashSessionInput = z.infer<typeof openCashSessionSchema>;

export const closeCashSessionSchema = z.object({
  closingBalanceCents: z.number().int().nonnegative(),
});
export type CloseCashSessionInput = z.infer<typeof closeCashSessionSchema>;

const CASH_SESSION_STATUSES = ["OPEN", "CLOSED"] as const;

export const listCashSessionsQuerySchema = z.object({
  campusId: z.string().min(1).optional(),
  status: z.enum(CASH_SESSION_STATUSES).optional(),
});
export type ListCashSessionsQuery = z.infer<typeof listCashSessionsQuerySchema>;
