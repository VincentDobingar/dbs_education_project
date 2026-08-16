import { z } from "zod";

const ORGANIZATION_TYPES = ["NGO", "COMPANY", "GOVERNMENT", "OTHER"] as const;

export const createOrganizationSchema = z.object({
  name: z.string().min(1),
  type: z.enum(ORGANIZATION_TYPES),
  countryId: z.string().min(1).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  justification: z.string().optional(),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(ORGANIZATION_TYPES).optional(),
  countryId: z.string().min(1).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  justification: z.string().optional(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const listOrganizationsQuerySchema = z.object({
  type: z.enum(ORGANIZATION_TYPES).optional(),
});
export type ListOrganizationsQuery = z.infer<typeof listOrganizationsQuerySchema>;

export const deleteOrganizationSchema = z.object({
  justification: z.string().optional(),
});
export type DeleteOrganizationInput = z.infer<typeof deleteOrganizationSchema>;
