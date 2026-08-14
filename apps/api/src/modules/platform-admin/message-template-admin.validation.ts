import { z } from "zod";

const NOTIFICATION_CHANNELS = ["EMAIL", "SMS", "PUSH", "IN_APP"] as const;

export const createMessageTemplateSchema = z.object({
  tenantId: z.string().min(1).optional(),
  code: z.string().min(1),
  channel: z.enum(NOTIFICATION_CHANNELS),
  subject: z.string().optional(),
  bodyFr: z.string().min(1),
  bodyEn: z.string().min(1),
  justification: z.string().optional(),
});
export type CreateMessageTemplateInput = z.infer<typeof createMessageTemplateSchema>;

export const updateMessageTemplateSchema = z.object({
  subject: z.string().optional(),
  bodyFr: z.string().min(1).optional(),
  bodyEn: z.string().min(1).optional(),
  justification: z.string().optional(),
});
export type UpdateMessageTemplateInput = z.infer<typeof updateMessageTemplateSchema>;

export const listMessageTemplatesQuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  channel: z.enum(NOTIFICATION_CHANNELS).optional(),
});
export type ListMessageTemplatesQuery = z.infer<typeof listMessageTemplatesQuerySchema>;

export const deleteMessageTemplateSchema = z.object({
  justification: z.string().optional(),
});
export type DeleteMessageTemplateInput = z.infer<typeof deleteMessageTemplateSchema>;
