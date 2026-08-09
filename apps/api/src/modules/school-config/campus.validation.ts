import { z } from "zod";

export const createCampusSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(1),
  address: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email().optional(),
  isMain: z.boolean().optional(),
});
export type CreateCampusInput = z.infer<typeof createCampusSchema>;

export const updateCampusSchema = createCampusSchema.partial();
export type UpdateCampusInput = z.infer<typeof updateCampusSchema>;
