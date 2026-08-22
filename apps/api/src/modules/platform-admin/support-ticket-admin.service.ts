import type { Prisma, SupportTicket, SupportTicketMessage } from "@prisma/client";

import { recordAuditLog } from "../../lib/audit-log.js";
import { sendEmail } from "../../lib/email-provider/send-email.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendSms } from "../../lib/sms-provider/send-sms.js";

import type { PlatformActor } from "./platform-actor.js";
import type {
  AddSupportTicketMessageInput,
  AssignSupportTicketInput,
  ListSupportTicketsQuery,
  UpdateSupportTicketStatusInput,
} from "./support-ticket-admin.validation.js";

export type SupportTicketWithMessages = SupportTicket & { messages: SupportTicketMessage[] };

/**
 * SupportTicket n'est pas un modèle tenant-scoped au sens de la garde Prisma
 * (tenantId nullable, cf. tenant-scoped-models.ts) — le client gardé `prisma` se
 * comporte comme rawPrisma ici. Comme les pays/devises et les codes promo, assigner
 * ou répondre à un ticket n'est pas le type d'intervention que §31 rend
 * explicitement obligatoire de justifier : la justification reste optionnelle,
 * recordAuditLog trace quand même chaque écriture (avec le tenantId du ticket).
 */

async function auditSupportTicket(
  actor: PlatformActor,
  action: string,
  ticket: SupportTicket,
  beforeData: Prisma.InputJsonValue | undefined,
  afterData: Prisma.InputJsonValue,
): Promise<void> {
  await recordAuditLog({
    tenantId: ticket.tenantId,
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action,
    entityType: "SupportTicket",
    entityId: ticket.id,
    ...(beforeData !== undefined ? { beforeData } : {}),
    afterData,
    ...(actor.justification ? { justification: actor.justification } : {}),
  });
}

export async function listSupportTickets(query: ListSupportTicketsQuery): Promise<SupportTicket[]> {
  return prisma.supportTicket.findMany({
    where: {
      ...(query.tenantId !== undefined ? { tenantId: query.tenantId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.priority !== undefined ? { priority: query.priority } : {}),
      ...(query.assignedToUserId !== undefined ? { assignedToUserId: query.assignedToUserId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function requireSupportTicket(id: string): Promise<SupportTicketWithMessages> {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) {
    throw new AppError(404, "SUPPORT_TICKET_NOT_FOUND", `Support ticket not found: ${id}`);
  }
  return ticket;
}

export async function assignSupportTicket(
  id: string,
  input: AssignSupportTicketInput,
  actor: PlatformActor,
): Promise<SupportTicket> {
  const before = await requireSupportTicket(id);
  const assignee = await prisma.user.findUnique({ where: { id: input.assignedToUserId } });
  if (!assignee) {
    throw new AppError(404, "USER_NOT_FOUND", `User not found: ${input.assignedToUserId}`);
  }

  const updated = await prisma.supportTicket.update({
    where: { id },
    data: { assignedToUserId: input.assignedToUserId },
  });

  await auditSupportTicket(
    actor,
    "support_ticket.assign",
    updated,
    { assignedToUserId: before.assignedToUserId },
    { assignedToUserId: updated.assignedToUserId },
  );
  return updated;
}

export async function updateSupportTicketStatus(
  id: string,
  input: UpdateSupportTicketStatusInput,
  actor: PlatformActor,
): Promise<SupportTicket> {
  const before = await requireSupportTicket(id);

  const updated = await prisma.supportTicket.update({
    where: { id },
    data: {
      status: input.status,
      closedAt: input.status === "CLOSED" ? new Date() : null,
    },
  });

  await auditSupportTicket(
    actor,
    "support_ticket.status_update",
    updated,
    { status: before.status },
    { status: updated.status },
  );
  return updated;
}

/**
 * Ferme le dernier point noté hors périmètre pour §31 tranche 5 : une réponse de
 * staff n'était visible qu'en rouvrant le ticket. Même canaux que §28
 * (sendEmail/sendSms, no-op tant qu'aucun fournisseur n'est configuré) — jamais pour
 * une note interne (isInternalNote), qui ne doit jamais atteindre l'auteur du ticket.
 */
async function notifyTicketAuthorOfReply(ticket: SupportTicket, body: string): Promise<void> {
  const author = await prisma.user.findUnique({
    where: { id: ticket.createdByUserId },
    select: { email: true, phone: true },
  });
  if (!author) {
    return;
  }

  sendEmail({
    to: author.email,
    subject: `New reply on your support ticket: ${ticket.subject}`,
    text: body,
  });
  if (author.phone) {
    sendSms({ to: author.phone, body: `New reply on your support ticket "${ticket.subject}": ${body}` });
  }
}

export async function addSupportTicketMessage(
  id: string,
  input: AddSupportTicketMessageInput,
  actor: PlatformActor,
): Promise<SupportTicketMessage> {
  const ticket = await requireSupportTicket(id);
  if (ticket.status === "CLOSED") {
    throw new AppError(409, "SUPPORT_TICKET_CLOSED", `Support ticket is closed: ${id}`);
  }

  const message = await prisma.supportTicketMessage.create({
    data: {
      ticketId: id,
      authorUserId: actor.actorUserId,
      body: input.body,
      isInternalNote: input.isInternalNote ?? false,
    },
  });

  await auditSupportTicket(actor, "support_ticket.message", ticket, undefined, {
    isInternalNote: message.isInternalNote,
  });

  if (!message.isInternalNote) {
    await notifyTicketAuthorOfReply(ticket, message.body);
  }

  return message;
}
