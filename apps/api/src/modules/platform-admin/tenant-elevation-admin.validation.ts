import { z } from "zod";

/** §31 : "limité dans le temps" — plafond arbitraire mais explicite plutôt qu'une durée illimitée. */
export const MAX_ELEVATION_HOURS = 72;

export const elevateInTenantSchema = z.object({
  roleCode: z.string().min(1),
  durationHours: z.number().int().min(1).max(MAX_ELEVATION_HOURS),
  justification: z.string().min(1),
});
export type ElevateInTenantInput = z.infer<typeof elevateInTenantSchema>;
