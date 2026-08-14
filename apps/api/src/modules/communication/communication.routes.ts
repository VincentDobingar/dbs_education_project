import { Router } from "express";

import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";

import * as announcementController from "./announcement.controller.js";
import * as notificationController from "./notification.controller.js";
import * as supportTicketController from "./support-ticket.controller.js";

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

// Personnel de l'établissement : gestion des annonces (§28), même chaîne que les
// autres modules tenant-scoped.
const manageCommunication = requirePermission("communication.manage");

communicationRouter.post(
  "/announcements",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  manageCommunication,
  announcementController.createAnnouncement,
);
communicationRouter.get(
  "/announcements",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  manageCommunication,
  announcementController.listAnnouncements,
);
communicationRouter.delete(
  "/announcements/:id",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  manageCommunication,
  announcementController.removeAnnouncement,
);

// Tickets de support (§31) : tout membre du tenant peut ouvrir un ticket et suivre
// ses propres tickets — geste self-service de base, pas de permission dédiée.
communicationRouter.post(
  "/support-tickets",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  supportTicketController.createSupportTicket,
);
communicationRouter.get(
  "/support-tickets",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  supportTicketController.listMyTickets,
);
communicationRouter.get(
  "/support-tickets/:id",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  supportTicketController.getMyTicket,
);
communicationRouter.post(
  "/support-tickets/:id/messages",
  requireAuth,
  enforceTenantScope,
  requireTenantMembership,
  supportTicketController.addTicketMessage,
);
