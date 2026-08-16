import type { Subscription, Tenant } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { rawPrisma, withTenantSession } from "../../lib/prisma.js";
import { createDraftSubscription } from "../subscriptions/subscription.service.js";

import type { OnboardTenantInput } from "./tenant.validation.js";

export interface OnboardTenantResult {
  tenant: Tenant;
  subdomain: string;
  subscription: Subscription | null;
}

/**
 * §14: creates the tenant, claims its subdomain, and makes the already-authenticated
 * responsible user its SCHOOL_OWNER — all in one flow, run in two atomic phases
 * (Tenant+TenantDomain, then TenantMembership+UserRole) because the second phase
 * needs the tenant's own id to satisfy Row-Level Security (§2), which can only be
 * known once the first phase has committed. If phase two fails, the tenant and
 * domain from phase one are cleaned up rather than left orphaned.
 */
export async function onboardTenant(userId: string, input: OnboardTenantInput): Promise<OnboardTenantResult> {
  const country = await rawPrisma.country.findUnique({ where: { isoCode: input.countryIsoCode } });
  if (!country) {
    throw new AppError(404, "COUNTRY_NOT_FOUND", `Unknown country: ${input.countryIsoCode}`);
  }

  const currency = await rawPrisma.currency.findUnique({ where: { isoCode: input.currencyIsoCode } });
  if (!currency) {
    throw new AppError(404, "CURRENCY_NOT_FOUND", `Unknown currency: ${input.currencyIsoCode}`);
  }

  const subdomainTaken = await rawPrisma.tenantDomain.findUnique({ where: { subdomain: input.subdomain } });
  if (subdomainTaken) {
    throw new AppError(409, "SUBDOMAIN_TAKEN", `Subdomain already in use: ${input.subdomain}`);
  }

  const { tenant } = await rawPrisma.$transaction(async (tx) => {
    const createdTenant = await tx.tenant.create({
      data: {
        name: input.name,
        ownershipType: input.ownershipType,
        countryId: country.id,
        currencyId: currency.id,
        status: "PENDING_VERIFICATION",
        ...(input.licenseNumber ? { licenseNumber: input.licenseNumber } : {}),
        ...(input.region ? { region: input.region } : {}),
        ...(input.city ? { city: input.city } : {}),
        ...(input.address ? { address: input.address } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
        ...(input.email ? { email: input.email } : {}),
      },
    });

    // The subdomain is claimed through this official signup flow, so it is
    // inherently verified — no separate DNS-style challenge for this MVP.
    await tx.tenantDomain.create({
      data: { tenantId: createdTenant.id, subdomain: input.subdomain, verifiedAt: new Date() },
    });

    return { tenant: createdTenant };
  });

  try {
    await withTenantSession(tenant.id, async (tx) => {
      await tx.tenantMembership.create({
        data: { userId, tenantId: tenant.id, status: "ACTIVE", joinedAt: new Date() },
      });

      const ownerRole = await tx.role.findUniqueOrThrow({ where: { code: "SCHOOL_OWNER" } });
      await tx.userRole.create({ data: { userId, roleId: ownerRole.id, tenantId: tenant.id } });
    });
  } catch (error) {
    await rawPrisma.tenantDomain.deleteMany({ where: { tenantId: tenant.id } });
    await rawPrisma.tenant.delete({ where: { id: tenant.id } });
    throw error;
  }

  let subscription: Subscription | null = null;
  if (input.planCode) {
    subscription = await createDraftSubscription({
      ownerType: "SCHOOL",
      ownerRef: { tenantId: tenant.id },
      planCode: input.planCode,
      fundingSource: "SELF_PAID",
      billingPeriod: input.billingPeriod ?? "MONTHLY",
      ...(input.promoCode ? { promoCode: input.promoCode, redeemedByUserId: userId } : {}),
    });
  }

  return { tenant, subdomain: input.subdomain, subscription };
}
