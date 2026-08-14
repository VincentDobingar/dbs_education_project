import type { SupportTicket, SupportTicketMessage } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { AddSupportTicketMessageInput, CreateSupportTicketInput } from "./support-ticket.validation.js";

export type SupportTicketWithMessages = SupportTicket & { messages: SupportTicketMessage[] };

export async function createSupportTicket(
  input: CreateSupportTicketInput,
  userId: string,
): Promise<SupportTicket> {
  return prisma.supportTicket.create({
    data: {
      tenantId: requireCurrentTenantId(),
      createdByUserId: userId,
      subject: input.subject,
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
    },
  });
}

export async function listMyTickets(userId: string): Promise<SupportTicket[]> {
  return prisma.supportTicket.findMany({
    where: { tenantId: requireCurrentTenantId(), createdByUserId: userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function requireOwnTicket(id: string, userId: string): Promise<SupportTicketWithMessages> {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: { messages: { where: { isInternalNote: false }, orderBy: { createdAt: "asc" } } },
  });
  if (!ticket || ticket.tenantId !== requireCurrentTenantId() || ticket.createdByUserId !== userId) {
    throw new AppError(404, "SUPPORT_TICKET_NOT_FOUND", `Support ticket not found: ${id}`);
  }
  return ticket;
}

export async function addMessageToTicket(
  id: string,
  userId: string,
  input: AddSupportTicketMessageInput,
): Promise<SupportTicketMessage> {
  const ticket = await requireOwnTicket(id, userId);
  if (ticket.status === "CLOSED") {
    throw new AppError(409, "SUPPORT_TICKET_CLOSED", `Support ticket is closed: ${id}`);
  }

  return prisma.supportTicketMessage.create({
    data: {
      ticketId: id,
      authorUserId: userId,
      body: input.body,
      isInternalNote: false,
    },
  });
}
