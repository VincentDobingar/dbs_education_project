import { z } from "zod";

export const guardianSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(3).max(40),
  email: z.string().email().optional(),
  address: z.string().trim().max(500).optional(),
});
export const installmentSchema = z.object({
  amountCents: z.number().int().positive().max(2_000_000_000),
  dueDate: z.string().datetime(),
});
export const installmentsSchema = z
  .array(installmentSchema)
  .min(0)
  .max(3)
  .refine(
    (items) => items.reduce((sum, item) => sum + item.amountCents, 0) <= 2_000_000_000,
    "Le total des frais est trop élevé",
  )
  .refine(
    (items) =>
      items.every(
        (item, index) => index === 0 || new Date(item.dueDate) >= new Date(items[index - 1]!.dueDate),
      ),
    "Les échéances doivent être dans l'ordre chronologique",
  );
export const registrationPeriodSchema = z
  .object({
    academicYearId: z.string().min(1),
    name: z.string().trim().min(1).max(100),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    installments: installmentsSchema,
  })
  .refine((input) => input.endDate >= input.startDate, "La fin précède le début");
