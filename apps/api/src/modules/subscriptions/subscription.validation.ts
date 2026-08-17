import { z } from "zod";

const BILLING_PERIODS = ["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL", "SCHOOL_YEAR", "CUSTOM"] as const;

export const createSchoolSubscriptionSchema = z.object({
  planCode: z.string().min(1),
  billingPeriod: z.enum(BILLING_PERIODS),
  promoCode: z.string().min(1).optional(),
});

/** §9 : même forme que createSchoolSubscriptionSchema — seul l'ownerRef diffère côté service. */
export const createFamilySubscriptionSchema = z.object({
  planCode: z.string().min(1),
  billingPeriod: z.enum(BILLING_PERIODS),
  promoCode: z.string().min(1).optional(),
});

export const cancelSubscriptionSchema = z.object({
  reason: z.string().min(1).optional(),
});
