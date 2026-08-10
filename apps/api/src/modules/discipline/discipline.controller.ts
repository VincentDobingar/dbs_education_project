import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as disciplineService from "./discipline.service.js";
import {
  createIncidentSchema,
  listIncidentsQuerySchema,
  updateIncidentSchema,
} from "./discipline.validation.js";

export function createIncident(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const input = createIncidentSchema.parse(req.body);
    const incident = await disciplineService.createIncident(input, req.user.id);
    res.status(201).json(incident);
  })().catch(next);
}

export function listIncidents(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listIncidentsQuerySchema.parse(req.query);
    const incidents = await disciplineService.listIncidents(query);
    res.status(200).json(incidents);
  })().catch(next);
}

export function updateIncident(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateIncidentSchema.parse(req.body);
    const incident = await disciplineService.updateIncident(req.params.id as string, input);
    res.status(200).json(incident);
  })().catch(next);
}

export function removeIncident(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    await disciplineService.removeIncident(req.params.id as string);
    res.status(204).send();
  })().catch(next);
}

export function getStudentDisciplineHistory(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const history = await disciplineService.getStudentDisciplineHistory(req.params.studentId as string);
    res.status(200).json(history);
  })().catch(next);
}
