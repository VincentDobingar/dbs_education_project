import { Router } from "express";

import { requireAuth } from "../../middleware/requireAuth.js";

import * as notificationController from "./notification.controller.js";

export const communicationRouter: Router = Router();

// Toujours scopé sur req.user.id — pas de contexte tenant requis (Notification n'est
// pas un modèle tenant-scoped, un parent peut avoir des notifications de plusieurs
// établissements, §9).
communicationRouter.get("/notifications", requireAuth, notificationController.listNotifications);
communicationRouter.patch(
  "/notifications/:id/read",
  requireAuth,
  notificationController.markNotificationRead,
);
