import type { AuditLog } from "@prisma/client";

import { recordAuditLog } from "../../lib/audit-log.js";
import { rawPrisma } from "../../lib/prisma.js";

import type { AuditLogExportQuery, ListAuditLogsQuery } from "./audit-log.validation.js";
import type { PlatformActor } from "./platform-actor.js";

const MAX_RESULTS = 200;
// Export de conformité, pas la liste interactive : pas de pagination ici non plus
// (même principe que listAuditLogsWhere), mais une fenêtre de dates obligatoire
// (voir audit-log.validation.ts) borne déjà le volume réaliste d'un export.
const MAX_EXPORT_RESULTS = 50_000;

function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

/** §31 : consultation des journaux d'audit — pas de pagination ailleurs dans le code, cohérent. */
export async function listAuditLogs(query: ListAuditLogsQuery): Promise<AuditLog[]> {
  return rawPrisma.auditLog.findMany({
    where: {
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: MAX_RESULTS,
  });
}

export async function exportAuditLogs(query: AuditLogExportQuery): Promise<AuditLog[]> {
  return rawPrisma.auditLog.findMany({
    where: {
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      createdAt: { gte: query.startDate, lte: endOfDay(query.endDate) },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_EXPORT_RESULTS,
  });
}

/**
 * Seule exception applicative à "AuditLog est immuable" (voir le commentaire du
 * modèle, identity.prisma) : une purge de rétention, gardée par SUPER_ADMIN
 * uniquement et par un seuil minimal de 365 jours côté validation. La purge
 * elle-même reste journalisée — sinon une suppression en masse ne laisserait
 * aucune trace de son propre passage.
 */
export async function purgeAuditLogs(
  olderThanDays: number,
  actor: PlatformActor,
): Promise<{ deletedCount: number; cutoffDate: Date }> {
  const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  const { count } = await rawPrisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoffDate } } });

  await recordAuditLog({
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action: "audit_log.purge",
    entityType: "AuditLog",
    entityId: "bulk",
    afterData: { deletedCount: count, olderThanDays, cutoffDate: cutoffDate.toISOString() },
    justification: actor.justification,
  });

  return { deletedCount: count, cutoffDate };
}
