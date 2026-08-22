import type {
  MessageTemplate,
  Notification,
  NotificationChannel,
  NotificationPreference,
  Prisma,
} from "@prisma/client";

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
 * Seul EMAIL est gardé par une préférence pour l'instant : IN_APP reste la source de
 * vérité (§28, jamais désactivable — la ligne "IN_APP" n'est même pas exposée par
 * upsertNotificationPreference ci-dessous) et SMS/PUSH ne sont consommés par aucun
 * appelant de notifyParentsOfStudent — exposer un opt-out qui ne changerait jamais
 * rien serait un contrôle fabriqué, jamais fait dans ce code.
 */
async function findEmailDisabledUserIds(userIds: string[], category: string): Promise<Set<string>> {
  const disabled = await prisma.notificationPreference.findMany({
    where: { userId: { in: userIds }, channel: "EMAIL", category, isEnabled: false },
    select: { userId: true },
  });
  return new Set(disabled.map((preference) => preference.userId));
}

/**
 * MessageTemplate a un tenantId nullable (global vs personnalisé par établissement,
 * §31 tranche 6) : le modèle propre au tenant l'emporte s'il existe, sinon on retombe
 * sur le modèle global — jamais l'inverse. Retourne `null` si aucun des deux n'existe
 * (aucun modèle géré pour cette catégorie), auquel cas l'appelant retombe sur le texte
 * en dur passé par `input` — comportement inchangé pour toute catégorie non modélisée.
 */
async function resolveMessageTemplate(
  tenantId: string,
  category: string,
  channel: NotificationChannel,
): Promise<MessageTemplate | null> {
  const scoped = await prisma.messageTemplate.findFirst({ where: { tenantId, code: category, channel } });
  if (scoped) {
    return scoped;
  }
  return prisma.messageTemplate.findFirst({ where: { tenantId: null, code: category, channel } });
}

/**
 * Un seul emplacement de substitution, volontairement pas un moteur de gabarit
 * complet : `input.body` porte déjà le détail concret (nom d'élève, sévérité...)
 * calculé par l'appelant (attendance.service.ts, discipline.service.ts) — le modèle
 * ne fait qu'habiller ce texte (formule de politesse, branding établissement), jamais
 * le remplacer. Le modèle sans `{{message}}` reste un texte statique tel quel.
 */
function renderTemplateBody(template: MessageTemplate, locale: string, message: string): string {
  const body = locale === "en" ? template.bodyEn : template.bodyFr;
  return body.replace("{{message}}", message);
}

/**
 * IN_APP reste la source de vérité (§28) : le parent voit toujours la notification
 * via GET /communication/notifications, quoi qu'il arrive avec l'email ci-dessous —
 * jamais habillée par un `MessageTemplate`, c'est l'enregistrement exact de ce qui
 * s'est passé. En plus de l'IN_APP, une copie email part vers chaque parent qui n'a
 * pas désactivé la catégorie `input.type` pour le canal EMAIL (NotificationPreference,
 * opt-out — absence de ligne = activé par défaut, jamais un opt-in implicite inversé),
 * habillée par le `MessageTemplate` EMAIL de cette catégorie s'il en existe un (sujet
 * et corps fr/en selon `UserProfile.locale` du parent), sinon `input.title`/`input.body`
 * tels quels comme avant. sendEmail no-ope tant qu'aucun fournisseur SMTP n'est
 * configuré (lib/notification-channels.ts). Silencieux si l'élève n'a aucun parent
 * VERIFIED — ce n'est pas une erreur.
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
    select: { id: true, email: true, profile: { select: { locale: true } } },
  });
  const [emailDisabled, template] = await Promise.all([
    findEmailDisabledUserIds(
      parents.map((parent) => parent.id),
      input.type,
    ),
    resolveMessageTemplate(tenantId, input.type, "EMAIL"),
  ]);
  for (const parent of parents) {
    if (emailDisabled.has(parent.id)) {
      continue;
    }
    const subject = template?.subject ?? input.title ?? "New notification";
    const text = template
      ? renderTemplateBody(template, parent.profile?.locale ?? "fr", input.body)
      : input.body;
    sendEmail({ to: parent.email, subject, text });
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

/** NotificationPreference n'a pas de tenantId (comme Notification) : ne renvoie que les
 * lignes explicitement écrites par l'utilisateur — l'absence d'une (channel, category)
 * dans cette liste veut dire "activé par défaut", jamais matérialisée en base. */
export async function listNotificationPreferences(userId: string): Promise<NotificationPreference[]> {
  return prisma.notificationPreference.findMany({
    where: { userId },
    orderBy: [{ channel: "asc" }, { category: "asc" }],
  });
}

export async function upsertNotificationPreference(
  userId: string,
  channel: NotificationChannel,
  category: string,
  isEnabled: boolean,
): Promise<NotificationPreference> {
  return prisma.notificationPreference.upsert({
    where: { userId_channel_category: { userId, channel, category } },
    create: { userId, channel, category, isEnabled },
    update: { isEnabled },
  });
}
