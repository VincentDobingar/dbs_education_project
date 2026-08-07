import { randomBytes } from "node:crypto";

import type { SubscriberCategory, SubscriptionStatus, Tenant, User } from "@prisma/client";

import { hashPassword } from "../lib/password.js";

import { testAdminPrisma } from "./admin-client.js";

export function uniqueSuffix(): string {
  return randomBytes(4).toString("hex");
}

export async function createTenant(namePrefix = "Tenant"): Promise<{ tenant: Tenant; subdomain: string }> {
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

export async function grantRole(userId: string, roleCode: string, tenantId: string | null): Promise<void> {
  const role = await testAdminPrisma.role.findUniqueOrThrow({ where: { code: roleCode } });
  await testAdminPrisma.userRole.create({ data: { userId, roleId: role.id, tenantId } });
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
) {
  const plan = await testAdminPrisma.subscriptionPlan.findUniqueOrThrow({ where: { code: planCode } });
  const owner = await testAdminPrisma.subscriptionOwner.create({ data: { ownerType, ...ownerRef } });

  return testAdminPrisma.subscription.create({
    data: {
      ownerId: owner.id,
      planId: plan.id,
      status,
      fundingSource: "SELF_PAID",
      billingPeriod: "MONTHLY",
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
