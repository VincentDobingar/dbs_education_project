import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as announcementService from "./announcement.service.js";
import { createAnnouncementSchema, listAnnouncementsQuerySchema } from "./announcement.validation.js";

export function createAnnouncement(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const input = createAnnouncementSchema.parse(req.body);
    const announcement = await announcementService.createAnnouncement(input, req.user.id);
    res.status(201).json(announcement);
  })().catch(next);
}

export function listAnnouncements(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listAnnouncementsQuerySchema.parse(req.query);
    const announcements = await announcementService.listAnnouncements(query);
    res.status(200).json(announcements);
  })().catch(next);
}

export function removeAnnouncement(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    await announcementService.removeAnnouncement(req.params.id as string);
    res.status(204).send();
  })().catch(next);
}
