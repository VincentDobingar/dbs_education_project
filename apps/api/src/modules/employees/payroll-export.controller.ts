import type { NextFunction, Request, Response } from "express";

import { XLSX_CONTENT_TYPE } from "../../lib/xlsx.js";

import * as payrollExportService from "./payroll-export.service.js";

export function getPayrollExportCsv(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const lines = await payrollExportService.getPayrollExport();
    const csv = payrollExportService.payrollExportToCsv(lines);
    res
      .status(200)
      .set("Content-Type", "text/csv; charset=utf-8")
      .set("Content-Disposition", 'attachment; filename="export-paie.csv"')
      .send(csv);
  })().catch(next);
}

export function getPayrollExportXlsx(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const lines = await payrollExportService.getPayrollExport();
    const xlsx = await payrollExportService.payrollExportToXlsx(lines);
    res
      .status(200)
      .set("Content-Type", XLSX_CONTENT_TYPE)
      .set("Content-Disposition", 'attachment; filename="export-paie.xlsx"')
      .send(xlsx);
  })().catch(next);
}
