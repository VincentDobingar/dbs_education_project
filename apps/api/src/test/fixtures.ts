import { randomBytes } from "node:crypto";

import type { FundingSource, SubscriberCategory, SubscriptionStatus, Tenant, User } from "@prisma/client";

import { hashPassword } from "../lib/password.js";

import { testAdminPrisma } from "./admin-client.js";

export function uniqueSuffix(): string {
  return randomBytes(4).toString("hex");
}

/**
 * §3.1 : tenant routes now require an active subscription (requireActiveSubscription
 * wired on every school-side router). Provisioning one by default here — rather than
 * in each of the ~50 call sites — keeps every existing test exercising those routes
 * working unchanged. Pass `activeSubscription: false` for tests that manage this
 * tenant's own subscription explicitly (they'd otherwise collide with this one on
 * SubscriptionOwner.tenantId, which is unique).
 */
export async function createTenant(
  namePrefix = "Tenant",
  options: { activeSubscription?: boolean } = {},
): Promise<{ tenant: Tenant; subdomain: string }> {
  const country = await testAdminPrisma.country.findUniqueOrThrow({ where: { isoCode: "CM" } });

  const tenant = await testAdminPrisma.tenant.create({
    data: {
      name: `${namePrefix} ${uniqueSuffix()}`,
      ownershipType: "PRIVATE",
      countryId: country.id,
      currencyId: country.defaultCurrencyId ?? "",
      status: "ACTIVE",
    },
  });

  const subdomain = `t${uniqueSuffix()}`;
  await testAdminPrisma.tenantDomain.create({
    data: { tenantId: tenant.id, subdomain, verifiedAt: new Date() },
  });

  if (options.activeSubscription ?? true) {
    await createSubscription({ tenantId: tenant.id }, "SCHOOL", "SCHOOL_ESSENTIAL", "ACTIVE");
  }

  return { tenant, subdomain };
}

export async function createUser(emailPrefix = "user"): Promise<User> {
  const passwordHash = await hashPassword("Sup3r-Secret-Passw0rd!");

  return testAdminPrisma.user.create({
    data: {
      email: `${emailPrefix}-${uniqueSuffix()}@example.test`,
      passwordHash,
      status: "ACTIVE",
      profile: { create: { firstName: "Test", lastName: "User" } },
    },
  });
}

export async function addMembership(userId: string, tenantId: string): Promise<void> {
  await testAdminPrisma.tenantMembership.create({ data: { userId, tenantId, status: "ACTIVE" } });
}

export async function grantRole(
  userId: string,
  roleCode: string,
  tenantId: string | null,
  expiresAt?: Date,
): Promise<void> {
  const role = await testAdminPrisma.role.findUniqueOrThrow({ where: { code: roleCode } });
  await testAdminPrisma.userRole.create({
    data: { userId, roleId: role.id, tenantId, ...(expiresAt !== undefined ? { expiresAt } : {}) },
  });
}

export async function createStudent(tenantId: string, matriculePrefix = "MAT") {
  return testAdminPrisma.student.create({
    data: {
      tenantId,
      matricule: `${matriculePrefix}-${uniqueSuffix()}`,
      firstName: "Eleve",
      lastName: "Test",
      status: "ACTIVE",
    },
  });
}

export async function createVerifiedRelationship(parentUserId: string, studentId: string, tenantId: string) {
  return testAdminPrisma.parentStudentRelationship.create({
    data: { parentUserId, studentId, tenantId, status: "VERIFIED", verifiedAt: new Date() },
  });
}

interface SubscriptionOwnerRef {
  tenantId?: string;
  studentId?: string;
  familyAccountId?: string;
}

export async function createSubscription(
  ownerRef: SubscriptionOwnerRef,
  ownerType: SubscriberCategory,
  planCode: string,
  status: SubscriptionStatus = "ACTIVE",
  fundingSource: FundingSource = "SELF_PAID",
) {
  const plan = await testAdminPrisma.subscriptionPlan.findUniqueOrThrow({ where: { code: planCode } });
  const owner = await testAdminPrisma.subscriptionOwner.create({ data: { ownerType, ...ownerRef } });

  return testAdminPrisma.subscription.create({
    data: {
      ownerId: owner.id,
      planId: plan.id,
      status,
      fundingSource,
      billingPeriod: "MONTHLY",
    },
  });
}

export async function createSponsoredLicense(
  planCode: string,
  options: {
    validUntil?: Date | null;
    status?: "AVAILABLE" | "ASSIGNED" | "REVOKED" | "EXPIRED";
    sponsorOrganizationId?: string;
    sponsorTenantId?: string;
  } = {},
) {
  const plan = await testAdminPrisma.subscriptionPlan.findUniqueOrThrow({ where: { code: planCode } });
  return testAdminPrisma.sponsoredLicense.create({
    data: {
      planId: plan.id,
      fundingSource: "SCHOOL_SPONSORED",
      status: options.status ?? "ASSIGNED",
      validUntil: options.validUntil ?? null,
      ...(options.sponsorOrganizationId ? { sponsorOrganizationId: options.sponsorOrganizationId } : {}),
      ...(options.sponsorTenantId ? { sponsorTenantId: options.sponsorTenantId } : {}),
    },
  });
}

export async function createLicenseAssignment(
  licenseId: string,
  subscriptionId: string,
  studentId: string,
  revokedAt: Date | null = null,
) {
  return testAdminPrisma.licenseAssignment.create({
    data: {
      licenseId,
      subscriptionId,
      beneficiaryType: "STUDENT",
      beneficiaryStudentId: studentId,
      revokedAt,
    },
  });
}

export async function grantEntitlement(
  subscriptionId: string,
  featureCode: string,
  options: { quotaLimit?: number; quotaUsed?: number } = {},
) {
  return testAdminPrisma.entitlement.create({
    data: { subscriptionId, featureCode, isEnabled: true, ...options },
  });
}
