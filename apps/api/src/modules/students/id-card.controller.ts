import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as idCardService from "./id-card.service.js";

export function generateIdCard(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.tenant) {
      throw new AppError(400, "TENANT_REQUIRED", "This route must be called on a tenant subdomain");
    }

    const studentId = req.params.id as string;
    const pdf = await idCardService.generateIdCardPdf(studentId, req.tenant.name);

    res
      .status(200)
      .set("Content-Type", "application/pdf")
      .set("Content-Disposition", `inline; filename="carte-${studentId}.pdf"`)
      .send(pdf);
  })().catch(next);
}
