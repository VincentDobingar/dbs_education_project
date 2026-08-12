import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as notificationService from "./notification.service.js";
import { listNotificationsQuerySchema } from "./notification.validation.js";

export function listNotifications(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const query = listNotificationsQuerySchema.parse(req.query);
    const notifications = await notificationService.listNotificationsForUser(req.user.id, query);
    res.status(200).json(notifications);
  })().catch(next);
}

export function markNotificationRead(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
    }
    const notification = await notificationService.markNotificationRead(req.params.id as string, req.user.id);
    res.status(200).json(notification);
  })().catch(next);
}
