import { z } from "zod";

export const recordCashPaymentSchema = z.object({
  amountCents: z.number().int().positive(),
});
export type RecordCashPaymentInput = z.infer<typeof recordCashPaymentSchema>;

export const refundStudentPaymentSchema = z.object({
  amountCents: z.number().int().positive(),
  reason: z.string().min(1),
});
export type RefundStudentPaymentInput = z.infer<typeof refundStudentPaymentSchema>;
