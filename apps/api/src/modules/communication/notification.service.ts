import type { Notification, Prisma } from "@prisma/client";

import { sendEmail } from "../../lib/email-provider/send-email.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { ListNotificationsQuery } from "./notification.validation.js";

export interface NotifyParentsInput {
  studentId: string;
  type: string;
  title?: string;
  body: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * IN_APP reste la source de vérité (§28) : le parent voit toujours la notification
 * via GET /communication/notifications, quoi qu'il arrive avec l'email ci-dessous.
 * En plus de l'IN_APP, une copie email part vers chaque parent (sendEmail no-ope
 * tant qu'aucun fournisseur SMTP n'est configuré, lib/notification-channels.ts).
 * Pas de gestion de préférence par canal ici : NotificationPreference existe au
 * schéma mais aucune interface ne le pilote encore — hors périmètre de cette
 * tranche, tout parent vérifié reçoit la copie email par défaut.
 * Silencieux si l'élève n'a aucun parent VERIFIED — ce n'est pas une erreur.
 */
export async function notifyParentsOfStudent(input: NotifyParentsInput): Promise<void> {
  const tenantId = requireCurrentTenantId();

  const relationships = await prisma.parentStudentRelationship.findMany({
    where: { studentId: input.studentId, status: "VERIFIED", revokedAt: null },
  });

  if (relationships.length === 0) {
    return;
  }

  await prisma.notification.createMany({
    data: relationships.map((relationship) => ({
      tenantId,
      userId: relationship.parentUserId,
      channel: "IN_APP" as const,
      type: input.type,
      body: input.body,
      status: "SENT" as const,
      sentAt: new Date(),
      ...(input.title ? { title: input.title } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    })),
  });

  const parents = await prisma.user.findMany({
    where: { id: { in: relationships.map((relationship) => relationship.parentUserId) } },
    select: { email: true },
  });
  for (const parent of parents) {
    sendEmail({ to: parent.email, subject: input.title ?? "New notification", text: input.body });
  }
}

export async function listNotificationsForUser(
  userId: string,
  query: ListNotificationsQuery,
): Promise<Notification[]> {
  return prisma.notification.findMany({
    where: { userId, ...(query.unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

async function requireOwnNotification(id: string, userId: string): Promise<Notification> {
  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification || notification.userId !== userId) {
    throw new AppError(404, "NOTIFICATION_NOT_FOUND", `Notification not found: ${id}`);
  }
  return notification;
}

export async function markNotificationRead(id: string, userId: string): Promise<Notification> {
  await requireOwnNotification(id, userId);
  return prisma.notification.update({ where: { id }, data: { status: "READ", readAt: new Date() } });
}
