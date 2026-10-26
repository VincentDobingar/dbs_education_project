import { z } from "zod";

import { justifiedActionSchema } from "./tenant-admin.validation.js";

const locale = z.enum(["fr", "en"]).default("fr");

export const invitePlatformTenantUserSchema = justifiedActionSchema.extend({
  email: z.string().email(),
  roleCode: z.string().min(1),
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  // Envoie le lien « choisir un mot de passe » au compte (activé par défaut).
  sendAccessEmail: z.boolean().default(true),
  locale,
});
export type InvitePlatformTenantUserInput = z.infer<typeof invitePlatformTenantUserSchema>;

export const grantPlatformTenantRoleSchema = justifiedActionSchema.extend({
  roleCode: z.string().min(1),
});

export const updatePlatformTenantMembershipSchema = justifiedActionSchema.extend({
  status: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]),
});

export const sendAccessEmailSchema = justifiedActionSchema.extend({ locale });
