import type { NextFunction, Request, Response } from "express";

import { XLSX_CONTENT_TYPE } from "../../lib/xlsx.js";

import * as importExportService from "./import-export.service.js";
import { importStudentsSchema } from "./import-export.validation.js";

export function importStudents(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = importStudentsSchema.parse(req.body);
    const result = await importExportService.importStudentsFromCsv(input.csv);
    res.status(200).json(result);
  })().catch(next);
}

export function exportStudents(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const csv = await importExportService.exportStudentsToCsv();
    res
      .status(200)
      .set("Content-Type", "text/csv; charset=utf-8")
      .set("Content-Disposition", 'attachment; filename="students.csv"')
      .send(csv);
  })().catch(next);
}

export function exportStudentsXlsx(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const xlsx = await importExportService.exportStudentsToXlsx();
    res
      .status(200)
      .set("Content-Type", XLSX_CONTENT_TYPE)
      .set("Content-Disposition", 'attachment; filename="students.xlsx"')
      .send(xlsx);
  })().catch(next);
}
