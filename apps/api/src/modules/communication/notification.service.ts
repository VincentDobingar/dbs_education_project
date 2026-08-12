import type { Notification, Prisma } from "@prisma/client";

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
 * IN_APP uniquement pour cette tranche (§28) : aucun fournisseur EMAIL/SMS/PUSH réel
 * n'est câblé nulle part dans ce code (même limite assumée que Mobile Money, §24).
 * Un parent vérifié voit la notification via GET /communication/notifications.
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
