import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as employeeDocumentService from "./employee-document.service.js";
import { createEmployeeDocumentSchema } from "./employee-document.validation.js";

export function addEmployeeDocument(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const input = createEmployeeDocumentSchema.parse(req.body);
    const document = await employeeDocumentService.addEmployeeDocument(
      req.params.employeeId as string,
      req.user.id,
      input,
    );
    res.status(201).json(document);
  })().catch(next);
}

export function listEmployeeDocuments(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const documents = await employeeDocumentService.listEmployeeDocuments(req.params.employeeId as string);
    res.status(200).json(documents);
  })().catch(next);
}

export function removeEmployeeDocument(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    await employeeDocumentService.removeEmployeeDocument(
      req.params.employeeId as string,
      req.params.id as string,
    );
    res.status(204).send();
  })().catch(next);
}
