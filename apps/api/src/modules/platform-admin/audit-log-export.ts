import type { AuditLog } from "@prisma/client";

import { buildCsv } from "../../lib/csv.js";
import { buildXlsxBuffer, type XlsxCellValue } from "../../lib/xlsx.js";

const COLUMNS = [
  "id",
  "createdAt",
  "tenantId",
  "actorUserId",
  "actorRoleCode",
  "action",
  "entityType",
  "entityId",
  "justification",
  "ipAddress",
  "beforeData",
  "afterData",
] as const;

function jsonCell(value: unknown): string {
  return value === null || value === undefined ? "" : JSON.stringify(value);
}

function toRow(log: AuditLog): string[] {
  return [
    log.id,
    log.createdAt.toISOString(),
    log.tenantId ?? "",
    log.actorUserId ?? "",
    log.actorRoleCode ?? "",
    log.action,
    log.entityType,
    log.entityId,
    log.justification ?? "",
    log.ipAddress ?? "",
    jsonCell(log.beforeData),
    jsonCell(log.afterData),
  ];
}

export function auditLogsToCsv(logs: readonly AuditLog[]): string {
  return buildCsv(COLUMNS, logs.map(toRow));
}

export function auditLogsToXlsx(logs: readonly AuditLog[]): Promise<Buffer> {
  const rows: XlsxCellValue[][] = logs.map((log) => [
    log.id,
    log.createdAt,
    log.tenantId,
    log.actorUserId,
    log.actorRoleCode,
    log.action,
    log.entityType,
    log.entityId,
    log.justification,
    log.ipAddress,
    jsonCell(log.beforeData) || null,
    jsonCell(log.afterData) || null,
  ]);
  return buildXlsxBuffer("Journal d'audit", COLUMNS, rows);
}
