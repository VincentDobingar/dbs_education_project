import { z } from "zod";

import { BILLING_PERIODS } from "../subscriptions/subscription.validation.js";

const LICENSE_PURCHASER_TYPES = ["TENANT", "ORGANIZATION"] as const;
const LICENSE_STATUSES = ["AVAILABLE", "ASSIGNED", "REVOKED", "EXPIRED"] as const;
const LICENSE_BENEFICIARY_TYPES = ["PARENT", "STUDENT"] as const;

function refinePurchaser<
  T extends {
    purchaserType?: string | undefined;
    sponsorTenantId?: string | undefined;
    sponsorOrganizationId?: string | undefined;
  },
>(data: T): boolean {
  if (data.purchaserType === "TENANT") {
    return Boolean(data.sponsorTenantId) && !data.sponsorOrganizationId;
  }
  if (data.purchaserType === "ORGANIZATION") {
    return Boolean(data.sponsorOrganizationId) && !data.sponsorTenantId;
  }
  return true;
}

export const createLicenseBatchSchema = z
  .object({
    planId: z.string().min(1),
    purchaserType: z.enum(LICENSE_PURCHASER_TYPES),
    sponsorTenantId: z.string().min(1).optional(),
    sponsorOrganizationId: z.string().min(1).optional(),
    quantity: z.coerce.number().int().positive(),
    unitPriceCents: z.coerce.number().int().positive(),
    currencyId: z.string().min(1),
    purchasedAt: z.coerce.date().optional(),
    justification: z.string().optional(),
  })
  .refine(refinePurchaser, {
    message: "sponsorTenantId is required for TENANT, sponsorOrganizationId for ORGANIZATION (exclusively)",
    path: ["purchaserType"],
  });
export type CreateLicenseBatchInput = z.infer<typeof createLicenseBatchSchema>;

export const listLicenseBatchesQuerySchema = z.object({
  sponsorTenantId: z.string().min(1).optional(),
  sponsorOrganizationId: z.string().min(1).optional(),
  planId: z.string().min(1).optional(),
});
export type ListLicenseBatchesQuery = z.infer<typeof listLicenseBatchesQuerySchema>;

export const listLicensesQuerySchema = z.object({
  batchId: z.string().min(1).optional(),
  status: z.enum(LICENSE_STATUSES).optional(),
  sponsorTenantId: z.string().min(1).optional(),
  sponsorOrganizationId: z.string().min(1).optional(),
});
export type ListLicensesQuery = z.infer<typeof listLicensesQuerySchema>;

function refineBeneficiary<
  T extends {
    beneficiaryType?: string | undefined;
    beneficiaryUserId?: string | undefined;
    beneficiaryStudentId?: string | undefined;
  },
>(data: T): boolean {
  if (data.beneficiaryType === "PARENT") {
    return Boolean(data.beneficiaryUserId) && !data.beneficiaryStudentId;
  }
  if (data.beneficiaryType === "STUDENT") {
    return Boolean(data.beneficiaryStudentId) && !data.beneficiaryUserId;
  }
  return true;
}

/**
 * subscriptionId reste accepté pour rattacher une licence à un abonnement déjà
 * existant (comportement historique). Quand il est omis, assignLicense crée et
 * active lui-même l'abonnement du bénéficiaire à partir du plan de la licence —
 * billingPeriod devient alors obligatoire (il n'y a pas d'abonnement existant dont
 * le déduire).
 */
export const assignLicenseSchema = z
  .object({
    beneficiaryType: z.enum(LICENSE_BENEFICIARY_TYPES),
    beneficiaryUserId: z.string().min(1).optional(),
    beneficiaryStudentId: z.string().min(1).optional(),
    // Student est un modèle tenant-scoped (RLS) : le vérifier exige de savoir dans
    // quel tenant il se trouve, que rien d'autre dans cette requête ne fournit.
    // Seulement requis pour créer un nouvel abonnement STUDENT (subscriptionId
    // absent) — inutile quand la licence rattache un abonnement déjà résolu.
    tenantId: z.string().min(1).optional(),
    subscriptionId: z.string().min(1).optional(),
    billingPeriod: z.enum(BILLING_PERIODS).optional(),
    justification: z.string().optional(),
  })
  .refine(refineBeneficiary, {
    message: "beneficiaryUserId is required for PARENT, beneficiaryStudentId for STUDENT (exclusively)",
    path: ["beneficiaryType"],
  })
  .refine((data) => data.subscriptionId !== undefined || data.billingPeriod !== undefined, {
    message: "billingPeriod is required when subscriptionId is not provided",
    path: ["billingPeriod"],
  })
  .refine(
    (data) =>
      data.subscriptionId !== undefined || data.beneficiaryType !== "STUDENT" || data.tenantId !== undefined,
    {
      message: "tenantId is required when creating a new STUDENT subscription",
      path: ["tenantId"],
    },
  );
export type AssignLicenseInput = z.infer<typeof assignLicenseSchema>;

export const revokeLicenseSchema = z.object({
  reason: z.string().optional(),
  justification: z.string().optional(),
});
export type RevokeLicenseInput = z.infer<typeof revokeLicenseSchema>;
