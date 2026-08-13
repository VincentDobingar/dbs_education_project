import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as studentUserLinkService from "./student-user-link.service.js";

export function listLinkedStudents(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const linkedStudents = await studentUserLinkService.listLinkedStudentsForUser(req.user.id);
    res.status(200).json(linkedStudents);
  })().catch(next);
}
