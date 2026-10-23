import { z } from "zod";

export const listAuditLogsQuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  entityType: z.string().min(1).optional(),
  actorUserId: z.string().min(1).optional(),
});
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;

// Export de conformité : contrairement à la liste JSON (plafonnée, interactive),
// une fenêtre de dates est obligatoire pour borner le volume — même choix que
// financial-report.validation.ts.
export const auditLogExportQuerySchema = z
  .object({
    tenantId: z.string().min(1).optional(),
    entityType: z.string().min(1).optional(),
    actorUserId: z.string().min(1).optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
  })
  .refine((query) => query.endDate >= query.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });
export type AuditLogExportQuery = z.infer<typeof auditLogExportQuerySchema>;

// Purge de rétention : seuil minimal 365 jours (choix produit) pour qu'une purge
// accidentelle ne puisse jamais effacer des entrées récentes, et justification
// obligatoire comme toute intervention globale (§31).
export const purgeAuditLogsSchema = z.object({
  olderThanDays: z.coerce.number().int().min(365),
  justification: z.string().min(1),
});
export type PurgeAuditLogsInput = z.infer<typeof purgeAuditLogsSchema>;
