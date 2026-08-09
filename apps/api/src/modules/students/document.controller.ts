import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as documentService from "./document.service.js";
import { createStudentDocumentSchema } from "./document.validation.js";

export function addStudentDocument(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }

    const input = createStudentDocumentSchema.parse(req.body);
    const document = await documentService.addStudentDocument(
      req.params.studentId as string,
      req.user.id,
      input,
    );
    res.status(201).json(document);
  })().catch(next);
}

export function listStudentDocuments(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const documents = await documentService.listStudentDocuments(req.params.studentId as string);
    res.status(200).json(documents);
  })().catch(next);
}

export function removeStudentDocument(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    await documentService.removeStudentDocument(req.params.studentId as string, req.params.id as string);
    res.status(204).send();
  })().catch(next);
}
