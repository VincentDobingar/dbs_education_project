import { z } from "zod";

const TENANT_STATUSES = [
  "DRAFT",
  "PENDING_VERIFICATION",
  "VERIFIED",
  "TRIAL",
  "ACTIVE",
  "SUSPENDED",
  "EXPIRED",
  "REJECTED",
  "CANCELLED",
] as const;

export const listPlatformTenantsQuerySchema = z.object({
  status: z.enum(TENANT_STATUSES).optional(),
  search: z.string().min(1).optional(),
});
export type ListPlatformTenantsQuery = z.infer<typeof listPlatformTenantsQuerySchema>;

/** §31 : justification obligatoire pour toute intervention globale dans un tenant. */
export const justifiedActionSchema = z.object({
  justification: z.string().min(1),
});
export type JustifiedActionInput = z.infer<typeof justifiedActionSchema>;
