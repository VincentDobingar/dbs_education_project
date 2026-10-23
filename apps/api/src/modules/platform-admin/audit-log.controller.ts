import type { NextFunction, Request, Response } from "express";

import { XLSX_CONTENT_TYPE } from "../../lib/xlsx.js";

import { auditLogsToCsv, auditLogsToXlsx } from "./audit-log-export.js";
import * as auditLogService from "./audit-log.service.js";
import {
  auditLogExportQuerySchema,
  listAuditLogsQuerySchema,
  purgeAuditLogsSchema,
} from "./audit-log.validation.js";
import { resolveActor } from "./platform-actor.js";

export function listAuditLogs(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listAuditLogsQuerySchema.parse(req.query);
    const auditLogs = await auditLogService.listAuditLogs(query);
    res.status(200).json(auditLogs);
  })().catch(next);
}

export function exportAuditLogsCsv(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = auditLogExportQuerySchema.parse(req.query);
    const logs = await auditLogService.exportAuditLogs(query);
    const csv = auditLogsToCsv(logs);
    res
      .status(200)
      .set("Content-Type", "text/csv; charset=utf-8")
      .set("Content-Disposition", 'attachment; filename="journal-audit.csv"')
      .send(csv);
  })().catch(next);
}

export function exportAuditLogsXlsx(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = auditLogExportQuerySchema.parse(req.query);
    const logs = await auditLogService.exportAuditLogs(query);
    const xlsx = await auditLogsToXlsx(logs);
    res
      .status(200)
      .set("Content-Type", XLSX_CONTENT_TYPE)
      .set("Content-Disposition", 'attachment; filename="journal-audit.xlsx"')
      .send(xlsx);
  })().catch(next);
}

export function purgeAuditLogs(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = purgeAuditLogsSchema.parse(req.body);
    const actor = await resolveActor(req, input.justification);
    const result = await auditLogService.purgeAuditLogs(input.olderThanDays, actor);
    res.status(200).json(result);
  })().catch(next);
}
