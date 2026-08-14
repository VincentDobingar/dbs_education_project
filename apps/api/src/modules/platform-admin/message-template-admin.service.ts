import type { MessageTemplate, Prisma } from "@prisma/client";

import { recordAuditLog } from "../../lib/audit-log.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

import type {
  CreateMessageTemplateInput,
  ListMessageTemplatesQuery,
  UpdateMessageTemplateInput,
} from "./message-template-admin.validation.js";
import type { PlatformActor } from "./platform-actor.js";

/**
 * MessageTemplate n'est pas un modèle tenant-scoped au sens de la garde Prisma
 * (tenantId nullable, cf. tenant-scoped-models.ts) — le client gardé `prisma` se
 * comporte comme rawPrisma ici. Comme les tranches 3/4/5, gérer un modèle de
 * notification n'est pas le type d'intervention que §31 rend explicitement
 * obligatoire de justifier : la justification reste optionnelle, recordAuditLog
 * trace quand même chaque écriture (avec le tenantId du modèle si présent).
 */

async function auditMessageTemplate(
  actor: PlatformActor,
  action: string,
  template: MessageTemplate,
  beforeData: Prisma.InputJsonValue | undefined,
  afterData: Prisma.InputJsonValue,
): Promise<void> {
  await recordAuditLog({
    tenantId: template.tenantId,
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action,
    entityType: "MessageTemplate",
    entityId: template.id,
    ...(beforeData !== undefined ? { beforeData } : {}),
    afterData,
    ...(actor.justification ? { justification: actor.justification } : {}),
  });
}

export async function listMessageTemplates(query: ListMessageTemplatesQuery): Promise<MessageTemplate[]> {
  return prisma.messageTemplate.findMany({
    where: {
      ...(query.tenantId !== undefined ? { tenantId: query.tenantId } : {}),
      ...(query.channel !== undefined ? { channel: query.channel } : {}),
    },
    orderBy: [{ tenantId: "asc" }, { code: "asc" }],
  });
}

/**
 * @@unique([tenantId, code]) au schéma ne bloque pas deux lignes tenantId: NULL avec
 * le même code — Postgres traite deux NULL comme non égaux dans un index unique.
 * Vérification manuelle donc nécessaire, y compris (surtout) pour les modèles
 * globaux (tenantId absent de l'input).
 */
export async function createMessageTemplate(
  input: CreateMessageTemplateInput,
  actor: PlatformActor,
): Promise<MessageTemplate> {
  const tenantId = input.tenantId ?? null;
  const existing = await prisma.messageTemplate.findFirst({ where: { tenantId, code: input.code } });
  if (existing) {
    throw new AppError(
      409,
      "MESSAGE_TEMPLATE_CODE_TAKEN",
      `Message template code already in use for this scope: ${input.code}`,
    );
  }

  const template = await prisma.messageTemplate.create({
    data: {
      ...(input.tenantId !== undefined ? { tenantId: input.tenantId } : {}),
      code: input.code,
      channel: input.channel,
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      bodyFr: input.bodyFr,
      bodyEn: input.bodyEn,
    },
  });

  await auditMessageTemplate(actor, "message_template.create", template, undefined, {
    code: template.code,
    channel: template.channel,
  });
  return template;
}

export async function requireMessageTemplate(id: string): Promise<MessageTemplate> {
  const template = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!template) {
    throw new AppError(404, "MESSAGE_TEMPLATE_NOT_FOUND", `Message template not found: ${id}`);
  }
  return template;
}

export async function updateMessageTemplate(
  id: string,
  input: UpdateMessageTemplateInput,
  actor: PlatformActor,
): Promise<MessageTemplate> {
  const before = await requireMessageTemplate(id);

  const updated = await prisma.messageTemplate.update({
    where: { id },
    data: {
      ...(input.subject !== undefined ? { subject: input.subject } : {}),
      ...(input.bodyFr !== undefined ? { bodyFr: input.bodyFr } : {}),
      ...(input.bodyEn !== undefined ? { bodyEn: input.bodyEn } : {}),
    },
  });

  await auditMessageTemplate(
    actor,
    "message_template.update",
    updated,
    { bodyFr: before.bodyFr },
    { bodyFr: updated.bodyFr },
  );
  return updated;
}

export async function deleteMessageTemplate(id: string, actor: PlatformActor): Promise<void> {
  const template = await requireMessageTemplate(id);

  await auditMessageTemplate(
    actor,
    "message_template.delete",
    template,
    { code: template.code },
    { deleted: true },
  );
  await prisma.messageTemplate.delete({ where: { id } });
}
