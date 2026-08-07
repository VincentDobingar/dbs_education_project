import { PrismaClient } from "@prisma/client";

import { COUNTRIES, CURRENCIES } from "./data/countries-currencies.js";
import { PAYMENT_PROVIDERS } from "./data/payment-providers.js";
import {
  INDIVIDUAL_ROLES,
  PERMISSIONS,
  PLATFORM_ROLES,
  ROLE_PERMISSIONS,
  TENANT_ROLES,
} from "./data/roles-permissions.js";
import { SUBSCRIPTION_PLANS } from "./data/subscription-plans.js";

// Plain, unextended client on purpose: every table seeded here is global
// (Country/Currency/Role/Permission/SubscriptionPlan/PaymentProvider), never
// tenant-scoped, so the tenant-guard extension has nothing to do here.
const prisma = new PrismaClient();

async function seedCurrenciesAndCountries(): Promise<void> {
  for (const currency of CURRENCIES) {
    await prisma.currency.upsert({
      where: { isoCode: currency.isoCode },
      update: currency,
      create: currency,
    });
  }

  for (const country of COUNTRIES) {
    const currency = await prisma.currency.findUniqueOrThrow({ where: { isoCode: country.defaultCurrency } });
    await prisma.country.upsert({
      where: { isoCode: country.isoCode },
      update: {
        nameFr: country.nameFr,
        nameEn: country.nameEn,
        phoneCallingCode: country.phoneCallingCode,
        defaultCurrencyId: currency.id,
      },
      create: {
        isoCode: country.isoCode,
        nameFr: country.nameFr,
        nameEn: country.nameEn,
        phoneCallingCode: country.phoneCallingCode,
        defaultCurrencyId: currency.id,
      },
    });
  }

  console.log(`Seeded ${CURRENCIES.length} currencies and ${COUNTRIES.length} countries`);
}

async function seedRolesAndPermissions(): Promise<void> {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      update: permission,
      create: permission,
    });
  }

  const allRoles = [
    ...PLATFORM_ROLES.map((role) => ({ ...role, scope: "PLATFORM" as const })),
    ...TENANT_ROLES.map((role) => ({ ...role, scope: "TENANT" as const })),
    ...INDIVIDUAL_ROLES.map((role) => ({ ...role, scope: "INDIVIDUAL" as const })),
  ];

  for (const role of allRoles) {
    const created = await prisma.role.upsert({
      where: { code: role.code },
      update: { nameFr: role.nameFr, nameEn: role.nameEn, scope: role.scope },
      create: {
        code: role.code,
        nameFr: role.nameFr,
        nameEn: role.nameEn,
        scope: role.scope,
        isSystem: true,
      },
    });

    const permissionCodes = ROLE_PERMISSIONS[role.code] ?? [];

    for (const permissionCode of permissionCodes) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { code: permissionCode } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: created.id, permissionId: permission.id } },
        update: {},
        create: { roleId: created.id, permissionId: permission.id },
      });
    }
  }

  console.log(`Seeded ${PERMISSIONS.length} permissions and ${allRoles.length} roles`);
}

async function seedSubscriptionPlans(): Promise<void> {
  for (const plan of SUBSCRIPTION_PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { code: plan.code },
      update: plan,
      create: plan,
    });
  }

  console.log(`Seeded ${SUBSCRIPTION_PLANS.length} subscription plans`);
}

async function seedPaymentProviders(): Promise<void> {
  for (const provider of PAYMENT_PROVIDERS) {
    const country = provider.countryIso
      ? await prisma.country.findUnique({ where: { isoCode: provider.countryIso } })
      : null;

    await prisma.paymentProvider.upsert({
      where: { code: provider.code },
      update: {
        nameFr: provider.nameFr,
        nameEn: provider.nameEn,
        methodType: provider.methodType,
        ...(country ? { countryId: country.id } : {}),
      },
      create: {
        code: provider.code,
        nameFr: provider.nameFr,
        nameEn: provider.nameEn,
        methodType: provider.methodType,
        ...(country ? { countryId: country.id } : {}),
        isTestMode: true,
      },
    });
  }

  console.log(`Seeded ${PAYMENT_PROVIDERS.length} payment providers`);
}

async function main(): Promise<void> {
  await seedCurrenciesAndCountries();
  await seedRolesAndPermissions();
  await seedSubscriptionPlans();
  await seedPaymentProviders();
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
