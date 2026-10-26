import { z } from "zod";

const modes = ["ONSITE", "ONLINE", "HYBRID"] as const;
const formats = ["INDIVIDUAL", "GROUP"] as const;
const text = (max: number) => z.string().trim().min(1).max(max);

export const tariffSchema = z.object({
  label: text(120),
  format: z.enum(formats),
  mode: z.enum(modes),
  hourlyRateCents: z.number().int().positive().max(100_000_000),
  /** Part de l'établissement en points de base (1 000 = 10 %). */
  schoolShareBps: z.number().int().min(0).max(9_000),
  isActive: z.boolean().default(true),
});
export type TariffInput = z.infer<typeof tariffSchema>;

export const offerSchema = z
  .object({
    tariffId: z.string().min(1),
    subjectId: z.string().min(1).optional(),
    subjectLabel: text(120),
    levelLabel: text(120),
    title: text(160),
    description: text(2000),
    location: z.string().trim().max(200).optional(),
    accessDetails: z.string().trim().max(1000).optional(),
    capacity: z.number().int().min(1).max(200),
    totalMinutes: z
      .number()
      .int()
      .min(30)
      .max(200 * 60),
    startsOn: z.coerce.date(),
    endsOn: z.coerce.date(),
    scheduleNote: text(300),
  })
  .refine((offer) => offer.endsOn >= offer.startsOn, {
    message: "endsOn must be after startsOn",
    path: ["endsOn"],
  });
export type OfferInput = z.infer<typeof offerSchema>;

export const reviewSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(500).optional(),
});

export const catalogQuerySchema = z.object({
  country: z.string().length(2).toUpperCase().optional(),
  mode: z.enum(modes).optional(),
  q: z.string().trim().max(100).optional(),
});

export const enrollSchema = z.object({
  offerId: z.string().min(1),
  studentId: z.string().min(1),
});

export const paySchema = z.object({
  providerCode: z.string().min(1),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{8,22}$/, "phone")
    .transform((value) => value.replace(/\s+/g, ""))
    .refine((value) => /^\+?[0-9]{8,15}$/.test(value), "phone"),
});

export const markPaidSchema = z.object({
  reference: text(120),
  justification: text(500),
});
