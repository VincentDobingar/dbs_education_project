import type { NextFunction, Request, Response } from "express";

import * as auditLogService from "./audit-log.service.js";
import { listAuditLogsQuerySchema } from "./audit-log.validation.js";

export function listAuditLogs(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listAuditLogsQuerySchema.parse(req.query);
    const auditLogs = await auditLogService.listAuditLogs(query);
    res.status(200).json(auditLogs);
  })().catch(next);
}
