import type { NextFunction, Request, Response } from "express";

import * as calendarEventService from "./calendar-event.service.js";
import {
  createCalendarEventSchema,
  listCalendarEventsQuerySchema,
  updateCalendarEventSchema,
} from "./calendar-event.validation.js";

export function createCalendarEvent(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createCalendarEventSchema.parse(req.body);
    const event = await calendarEventService.createCalendarEvent(input);
    res.status(201).json(event);
  })().catch(next);
}

export function listCalendarEvents(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listCalendarEventsQuerySchema.parse(req.query);
    const events = await calendarEventService.listCalendarEvents(query);
    res.status(200).json(events);
  })().catch(next);
}

export function updateCalendarEvent(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateCalendarEventSchema.parse(req.body);
    const event = await calendarEventService.updateCalendarEvent(req.params.id as string, input);
    res.status(200).json(event);
  })().catch(next);
}

export function removeCalendarEvent(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    await calendarEventService.removeCalendarEvent(req.params.id as string);
    res.status(204).send();
  })().catch(next);
}
