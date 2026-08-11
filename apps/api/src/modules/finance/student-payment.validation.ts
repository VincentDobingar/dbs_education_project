import { z } from "zod";

export const recordCashPaymentSchema = z.object({
  amountCents: z.number().int().positive(),
});
export type RecordCashPaymentInput = z.infer<typeof recordCashPaymentSchema>;
