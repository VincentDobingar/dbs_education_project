import { z } from "zod";

const PAYMENT_METHOD_TYPES = [
  "CASH",
  "BANK_TRANSFER",
  "CARD",
  "MOBILE_MONEY",
  "WALLET",
  "PREPAID_CODE",
  "SPONSOR",
] as const;

export const createCountrySchema = z.object({
  isoCode: z.string().length(2),
  nameFr: z.string().min(1),
  nameEn: z.string().min(1),
  phoneCallingCode: z.string().min(1),
  defaultCurrencyId: z.string().min(1).optional(),
  justification: z.string().min(1).optional(),
});
export type CreateCountryInput = z.infer<typeof createCountrySchema>;

export const updateCountrySchema = z.object({
  nameFr: z.string().min(1).optional(),
  nameEn: z.string().min(1).optional(),
  phoneCallingCode: z.string().min(1).optional(),
  defaultCurrencyId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  justification: z.string().min(1).optional(),
});
export type UpdateCountryInput = z.infer<typeof updateCountrySchema>;

export const createCurrencySchema = z.object({
  isoCode: z.string().length(3),
  nameFr: z.string().min(1),
  nameEn: z.string().min(1),
  symbol: z.string().min(1),
  decimalDigits: z.number().int().min(0).max(4).default(2),
  justification: z.string().min(1).optional(),
});
export type CreateCurrencyInput = z.infer<typeof createCurrencySchema>;

export const updateCurrencySchema = z.object({
  nameFr: z.string().min(1).optional(),
  nameEn: z.string().min(1).optional(),
  symbol: z.string().min(1).optional(),
  decimalDigits: z.number().int().min(0).max(4).optional(),
  isActive: z.boolean().optional(),
  justification: z.string().min(1).optional(),
});
export type UpdateCurrencyInput = z.infer<typeof updateCurrencySchema>;

export const createPaymentProviderSchema = z.object({
  code: z.string().min(1),
  nameFr: z.string().min(1),
  nameEn: z.string().min(1),
  countryId: z.string().min(1).optional(),
  methodType: z.enum(PAYMENT_METHOD_TYPES),
  isTestMode: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).optional(),
  justification: z.string().min(1).optional(),
});
export type CreatePaymentProviderInput = z.infer<typeof createPaymentProviderSchema>;

export const updatePaymentProviderSchema = z.object({
  nameFr: z.string().min(1).optional(),
  nameEn: z.string().min(1).optional(),
  isTestMode: z.boolean().optional(),
  isActive: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  justification: z.string().min(1).optional(),
});
export type UpdatePaymentProviderInput = z.infer<typeof updatePaymentProviderSchema>;
