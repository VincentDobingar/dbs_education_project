import type { NextFunction, Request, Response } from "express";

import * as statsAdminService from "./stats-admin.service.js";
import { statsOverviewQuerySchema } from "./stats-admin.validation.js";

export function getStatsOverview(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = statsOverviewQuerySchema.parse(req.query);
    const overview = await statsAdminService.getStatsOverview(query);
    res.status(200).json(overview);
  })().catch(next);
}
