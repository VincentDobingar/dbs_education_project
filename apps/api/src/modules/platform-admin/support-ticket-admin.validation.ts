import { z } from "zod";

const SUPPORT_TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_ON_USER", "RESOLVED", "CLOSED"] as const;
const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const listSupportTicketsQuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  status: z.enum(SUPPORT_TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  assignedToUserId: z.string().min(1).optional(),
});
export type ListSupportTicketsQuery = z.infer<typeof listSupportTicketsQuerySchema>;

export const assignSupportTicketSchema = z.object({
  assignedToUserId: z.string().min(1),
  justification: z.string().optional(),
});
export type AssignSupportTicketInput = z.infer<typeof assignSupportTicketSchema>;

export const updateSupportTicketStatusSchema = z.object({
  status: z.enum(SUPPORT_TICKET_STATUSES),
  justification: z.string().optional(),
});
export type UpdateSupportTicketStatusInput = z.infer<typeof updateSupportTicketStatusSchema>;

export const addSupportTicketMessageSchema = z.object({
  body: z.string().min(1),
  isInternalNote: z.boolean().optional(),
  justification: z.string().optional(),
});
export type AddSupportTicketMessageInput = z.infer<typeof addSupportTicketMessageSchema>;
