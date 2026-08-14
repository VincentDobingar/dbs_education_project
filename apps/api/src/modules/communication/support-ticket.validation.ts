import { z } from "zod";

const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const createSupportTicketSchema = z.object({
  subject: z.string().min(1),
  category: z.string().optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
});
export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;

export const addSupportTicketMessageSchema = z.object({
  body: z.string().min(1),
});
export type AddSupportTicketMessageInput = z.infer<typeof addSupportTicketMessageSchema>;
