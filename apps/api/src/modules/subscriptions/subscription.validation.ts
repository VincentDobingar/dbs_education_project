import { z } from "zod";

const BILLING_PERIODS = ["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL", "SCHOOL_YEAR", "CUSTOM"] as const;

export const createSchoolSubscriptionSchema = z.object({
  planCode: z.string().min(1),
  billingPeriod: z.enum(BILLING_PERIODS),
});

export const cancelSubscriptionSchema = z.object({
  reason: z.string().min(1).optional(),
});
