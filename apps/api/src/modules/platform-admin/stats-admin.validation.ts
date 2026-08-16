import { z } from "zod";

export const statsOverviewQuerySchema = z.object({
  windowDays: z.coerce.number().int().positive().max(365).optional(),
});
export type StatsOverviewQuery = z.infer<typeof statsOverviewQuerySchema>;
