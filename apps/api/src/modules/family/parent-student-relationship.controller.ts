import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as relationshipService from "./parent-student-relationship.service.js";
import {
  listRelationshipsQuerySchema,
  revokeRelationshipSchema,
} from "./parent-student-relationship.validation.js";

export function listRelationships(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listRelationshipsQuerySchema.parse(req.query);
    const relationships = await relationshipService.listRelationships(query);
    res.status(200).json(relationships);
  })().catch(next);
}

export function revokeRelationship(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const input = revokeRelationshipSchema.parse(req.body);
    const relationship = await relationshipService.revokeRelationship(
      req.params.id as string,
      input.reason,
      req.user.id,
    );
    res.status(200).json(relationship);
  })().catch(next);
}

export function listMyChildren(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const children = await relationshipService.listVerifiedChildrenForParent(req.user.id);
    res.status(200).json(children);
  })().catch(next);
}
