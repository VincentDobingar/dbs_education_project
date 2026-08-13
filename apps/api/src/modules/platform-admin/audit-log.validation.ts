import { z } from "zod";

export const listAuditLogsQuerySchema = z.object({
  tenantId: z.string().min(1).optional(),
  entityType: z.string().min(1).optional(),
  actorUserId: z.string().min(1).optional(),
});
export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
