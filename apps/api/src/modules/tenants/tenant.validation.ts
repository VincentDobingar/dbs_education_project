import { z } from "zod";

const SUBDOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/;

const BILLING_PERIODS = ["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL", "SCHOOL_YEAR", "CUSTOM"] as const;

export const onboardTenantSchema = z
  .object({
    name: z.string().min(2),
    ownershipType: z.enum(["PUBLIC", "PRIVATE"]),
    licenseNumber: z.string().min(1).optional(),
    countryIsoCode: z.string().length(2),
    region: z.string().min(1).optional(),
    city: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    email: z.string().email().optional(),
    currencyIsoCode: z.string().length(3),
    subdomain: z
      .string()
      .min(3)
      .max(63)
      .regex(SUBDOMAIN_PATTERN, "Subdomain must be lowercase letters, digits and hyphens only"),
    planCode: z.string().min(1).optional(),
    billingPeriod: z.enum(BILLING_PERIODS).optional(),
    promoCode: z.string().min(1).optional(),
  })
  .refine((data) => !data.promoCode || Boolean(data.planCode), {
    message: "promoCode requires planCode",
    path: ["promoCode"],
  });

export type OnboardTenantInput = z.infer<typeof onboardTenantSchema>;
