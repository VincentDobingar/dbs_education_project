import type { Prisma } from "@prisma/client";

import { rawPrisma } from "./prisma.js";

export interface RecordAuditLogInput {
  tenantId?: string | null;
  actorUserId: string;
  actorRoleCode?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeData?: Prisma.InputJsonValue;
  afterData?: Prisma.InputJsonValue;
  justification?: string | null;
  ipAddress?: string | null;
}

/**
 * §31 : toute intervention d'un administrateur global doit être visible dans les
 * audits. Écrit sur le client non gardé — AuditLog est volontairement hors RLS/garde
 * tenant (tenantId nullable, journal cross-tenant par nature).
 */
export async function recordAuditLog(input: RecordAuditLogInput): Promise<void> {
  await rawPrisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      ...(input.tenantId !== undefined ? { tenantId: input.tenantId } : {}),
      ...(input.actorRoleCode ? { actorRoleCode: input.actorRoleCode } : {}),
      ...(input.beforeData !== undefined ? { beforeData: input.beforeData } : {}),
      ...(input.afterData !== undefined ? { afterData: input.afterData } : {}),
      ...(input.justification ? { justification: input.justification } : {}),
      ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
    },
  });
}
