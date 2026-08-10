import type { NextFunction, Request, Response } from "express";

import * as timetableService from "./timetable.service.js";
import {
  createTimetableEntrySchema,
  createTimetableSchema,
  listTimetablesQuerySchema,
} from "./timetable.validation.js";

export function createTimetable(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createTimetableSchema.parse(req.body);
    const timetable = await timetableService.createTimetable(input);
    res.status(201).json(timetable);
  })().catch(next);
}

export function listTimetables(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listTimetablesQuerySchema.parse(req.query);
    const timetables = await timetableService.listTimetables(query);
    res.status(200).json(timetables);
  })().catch(next);
}

export function addTimetableEntry(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createTimetableEntrySchema.parse(req.body);
    const entry = await timetableService.addTimetableEntry(req.params.id as string, input);
    res.status(201).json(entry);
  })().catch(next);
}

export function listTimetableEntries(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const entries = await timetableService.listTimetableEntries(req.params.id as string);
    res.status(200).json(entries);
  })().catch(next);
}

export function removeTimetableEntry(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    await timetableService.removeTimetableEntry(req.params.id as string, req.params.entryId as string);
    res.status(204).send();
  })().catch(next);
}
