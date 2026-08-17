import { z } from "zod";

/** Fenêtre glissante par défaut pour les figures "récentes" (recettes/dépenses/incidents) — même défaut que stats-admin.service.ts (§31 tranche 9). */
export const dashboardWindowQuerySchema = z.object({
  windowDays: z.coerce.number().int().positive().max(365).optional(),
});
export type DashboardWindowQuery = z.infer<typeof dashboardWindowQuerySchema>;
