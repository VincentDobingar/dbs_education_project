import type { AuditLog } from "@prisma/client";

import { rawPrisma } from "../../lib/prisma.js";

import type { ListAuditLogsQuery } from "./audit-log.validation.js";

const MAX_RESULTS = 200;

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
