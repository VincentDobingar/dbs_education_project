import { z } from "zod";

export const inviteTenantUserSchema = z.object({
  email: z.string().email(),
  roleCode: z.string().min(1),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
});
export type InviteTenantUserInput = z.infer<typeof inviteTenantUserSchema>;

export const grantRoleSchema = z.object({
  roleCode: z.string().min(1),
});
export type GrantRoleInput = z.infer<typeof grantRoleSchema>;

const MEMBERSHIP_STATUSES = ["ACTIVE", "SUSPENDED", "REVOKED"] as const;

export const updateMembershipStatusSchema = z.object({
  status: z.enum(MEMBERSHIP_STATUSES),
});
export type UpdateMembershipStatusInput = z.infer<typeof updateMembershipStatusSchema>;
