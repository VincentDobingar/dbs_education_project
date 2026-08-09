import type { NextFunction, Request, Response } from "express";

import * as campusService from "./campus.service.js";
import { createCampusSchema, updateCampusSchema } from "./campus.validation.js";

export function createCampus(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createCampusSchema.parse(req.body);
    const campus = await campusService.createCampus(input);
    res.status(201).json(campus);
  })().catch(next);
}

export function listCampuses(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const campuses = await campusService.listCampuses();
    res.status(200).json(campuses);
  })().catch(next);
}

export function updateCampus(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateCampusSchema.parse(req.body);
    const campus = await campusService.updateCampus(req.params.id as string, input);
    res.status(200).json(campus);
  })().catch(next);
}
