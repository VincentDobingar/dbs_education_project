import type { Country, Currency, PaymentProvider, Prisma } from "@prisma/client";

import { recordAuditLog } from "../../lib/audit-log.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

import type { PlatformActor } from "./platform-actor.js";
import type {
  CreateCountryInput,
  CreateCurrencyInput,
  CreatePaymentProviderInput,
  UpdateCountryInput,
  UpdateCurrencyInput,
  UpdatePaymentProviderInput,
} from "./reference-data-admin.validation.js";

/**
 * Ni Country, ni Currency, ni PaymentProvider n'est un modèle tenant-scoped (pas de
 * colonne tenantId) — le client gardé `prisma` se comporte comme rawPrisma pour ces
 * trois-là, pas besoin de bootstrap. Contrairement aux tranches précédentes
 * (intervention *dans* un tenant), la justification reste optionnelle : gérer une
 * devise n'est pas une intervention dans un tenant au sens de §31, mais
 * recordAuditLog trace quand même chaque écriture pour la traçabilité.
 */

async function auditReferenceData(
  actor: PlatformActor,
  action: string,
  entityType: string,
  entityId: string,
  beforeData: Prisma.InputJsonValue | undefined,
  afterData: Prisma.InputJsonValue,
): Promise<void> {
  await recordAuditLog({
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action,
    entityType,
    entityId,
    ...(beforeData !== undefined ? { beforeData } : {}),
    afterData,
    ...(actor.justification ? { justification: actor.justification } : {}),
  });
}

export async function listCountries(): Promise<Country[]> {
  return prisma.country.findMany({ orderBy: { nameFr: "asc" } });
}

export async function createCountry(input: CreateCountryInput, actor: PlatformActor): Promise<Country> {
  const existing = await prisma.country.findUnique({ where: { isoCode: input.isoCode } });
  if (existing) {
    throw new AppError(409, "COUNTRY_ISO_CODE_TAKEN", `Country ISO code already in use: ${input.isoCode}`);
  }
  if (input.defaultCurrencyId) {
    await requireCurrency(input.defaultCurrencyId);
  }

  const country = await prisma.country.create({
    data: {
      isoCode: input.isoCode,
      nameFr: input.nameFr,
      nameEn: input.nameEn,
      phoneCallingCode: input.phoneCallingCode,
      ...(input.defaultCurrencyId ? { defaultCurrencyId: input.defaultCurrencyId } : {}),
    },
  });

  await auditReferenceData(actor, "country.create", "Country", country.id, undefined, {
    isoCode: country.isoCode,
  });
  return country;
}

async function requireCountry(id: string): Promise<Country> {
  const country = await prisma.country.findUnique({ where: { id } });
  if (!country) {
    throw new AppError(404, "COUNTRY_NOT_FOUND", `Country not found: ${id}`);
  }
  return country;
}

export async function updateCountry(
  id: string,
  input: UpdateCountryInput,
  actor: PlatformActor,
): Promise<Country> {
  const before = await requireCountry(id);
  if (input.defaultCurrencyId) {
    await requireCurrency(input.defaultCurrencyId);
  }

  const updated = await prisma.country.update({
    where: { id },
    data: {
      ...(input.nameFr !== undefined ? { nameFr: input.nameFr } : {}),
      ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
      ...(input.phoneCallingCode !== undefined ? { phoneCallingCode: input.phoneCallingCode } : {}),
      ...(input.defaultCurrencyId !== undefined ? { defaultCurrencyId: input.defaultCurrencyId } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  await auditReferenceData(
    actor,
    "country.update",
    "Country",
    id,
    { isActive: before.isActive },
    { isActive: updated.isActive },
  );
  return updated;
}

export async function listCurrencies(): Promise<Currency[]> {
  return prisma.currency.findMany({ orderBy: { isoCode: "asc" } });
}

export async function createCurrency(input: CreateCurrencyInput, actor: PlatformActor): Promise<Currency> {
  const existing = await prisma.currency.findUnique({ where: { isoCode: input.isoCode } });
  if (existing) {
    throw new AppError(409, "CURRENCY_ISO_CODE_TAKEN", `Currency ISO code already in use: ${input.isoCode}`);
  }

  const currency = await prisma.currency.create({
    data: {
      isoCode: input.isoCode,
      nameFr: input.nameFr,
      nameEn: input.nameEn,
      symbol: input.symbol,
      decimalDigits: input.decimalDigits,
    },
  });

  await auditReferenceData(actor, "currency.create", "Currency", currency.id, undefined, {
    isoCode: currency.isoCode,
  });
  return currency;
}

async function requireCurrency(id: string): Promise<Currency> {
  const currency = await prisma.currency.findUnique({ where: { id } });
  if (!currency) {
    throw new AppError(404, "CURRENCY_NOT_FOUND", `Currency not found: ${id}`);
  }
  return currency;
}

export async function updateCurrency(
  id: string,
  input: UpdateCurrencyInput,
  actor: PlatformActor,
): Promise<Currency> {
  const before = await requireCurrency(id);

  const updated = await prisma.currency.update({
    where: { id },
    data: {
      ...(input.nameFr !== undefined ? { nameFr: input.nameFr } : {}),
      ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
      ...(input.symbol !== undefined ? { symbol: input.symbol } : {}),
      ...(input.decimalDigits !== undefined ? { decimalDigits: input.decimalDigits } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  await auditReferenceData(
    actor,
    "currency.update",
    "Currency",
    id,
    { isActive: before.isActive },
    { isActive: updated.isActive },
  );
  return updated;
}

export async function listPaymentProviders(): Promise<PaymentProvider[]> {
  return prisma.paymentProvider.findMany({ orderBy: { code: "asc" } });
}

export async function createPaymentProvider(
  input: CreatePaymentProviderInput,
  actor: PlatformActor,
): Promise<PaymentProvider> {
  const existing = await prisma.paymentProvider.findUnique({ where: { code: input.code } });
  if (existing) {
    throw new AppError(
      409,
      "PAYMENT_PROVIDER_CODE_TAKEN",
      `Payment provider code already in use: ${input.code}`,
    );
  }
  if (input.countryId) {
    await requireCountry(input.countryId);
  }

  const provider = await prisma.paymentProvider.create({
    data: {
      code: input.code,
      nameFr: input.nameFr,
      nameEn: input.nameEn,
      methodType: input.methodType,
      isTestMode: input.isTestMode,
      ...(input.countryId ? { countryId: input.countryId } : {}),
      ...(input.config ? { config: input.config as Prisma.InputJsonValue } : {}),
    },
  });

  await auditReferenceData(actor, "payment_provider.create", "PaymentProvider", provider.id, undefined, {
    code: provider.code,
  });
  return provider;
}

async function requirePaymentProvider(id: string): Promise<PaymentProvider> {
  const provider = await prisma.paymentProvider.findUnique({ where: { id } });
  if (!provider) {
    throw new AppError(404, "PAYMENT_PROVIDER_NOT_FOUND", `Payment provider not found: ${id}`);
  }
  return provider;
}

export async function updatePaymentProvider(
  id: string,
  input: UpdatePaymentProviderInput,
  actor: PlatformActor,
): Promise<PaymentProvider> {
  const before = await requirePaymentProvider(id);

  const updated = await prisma.paymentProvider.update({
    where: { id },
    data: {
      ...(input.nameFr !== undefined ? { nameFr: input.nameFr } : {}),
      ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
      ...(input.isTestMode !== undefined ? { isTestMode: input.isTestMode } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.config !== undefined ? { config: input.config as Prisma.InputJsonValue } : {}),
    },
  });

  await auditReferenceData(
    actor,
    "payment_provider.update",
    "PaymentProvider",
    id,
    { isActive: before.isActive, isTestMode: before.isTestMode },
    { isActive: updated.isActive, isTestMode: updated.isTestMode },
  );
  return updated;
}
