import { z } from "zod";

export const createInvoiceSchema = z.object({
  currencyIsoCode: z.string().length(3),
  countryIsoCode: z.string().length(2).optional(),
  billingName: z.string().min(1),
  billingEmail: z.string().email(),
});

export const createPaymentIntentSchema = z.object({
  invoiceId: z.string().min(1),
  providerCode: z.string().min(1),
  idempotencyKey: z.string().min(1).optional(),
});

export const recordCashPaymentSchema = z.object({
  paymentIntentId: z.string().min(1),
});
