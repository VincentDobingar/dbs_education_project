import { z } from "zod";

const SUBSCRIPTION_STATUSES = [
  "DRAFT",
  "PENDING_PAYMENT",
  "PENDING_ACTIVATION",
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "GRACE_PERIOD",
  "SUSPENDED",
  "EXPIRED",
  "CANCELLED",
  "REFUNDED",
] as const;

const SUBSCRIBER_CATEGORIES = ["SCHOOL", "PARENT", "STUDENT", "ORGANIZATION"] as const;

export const listPlatformSubscriptionsQuerySchema = z.object({
  status: z.enum(SUBSCRIPTION_STATUSES).optional(),
  ownerType: z.enum(SUBSCRIBER_CATEGORIES).optional(),
});
export type ListPlatformSubscriptionsQuery = z.infer<typeof listPlatformSubscriptionsQuerySchema>;

export const transitionSubscriptionSchema = z.object({
  toStatus: z.enum(SUBSCRIPTION_STATUSES),
  justification: z.string().min(1),
});
export type TransitionSubscriptionInput = z.infer<typeof transitionSubscriptionSchema>;

export const extendTrialSchema = z.object({
  trialEndsAt: z.coerce.date(),
  justification: z.string().min(1),
});
export type ExtendTrialInput = z.infer<typeof extendTrialSchema>;
