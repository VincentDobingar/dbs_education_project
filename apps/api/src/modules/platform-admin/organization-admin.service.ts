import type { Organization, Prisma } from "@prisma/client";

import { recordAuditLog } from "../../lib/audit-log.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

import type {
  CreateOrganizationInput,
  ListOrganizationsQuery,
  UpdateOrganizationInput,
} from "./organization-admin.validation.js";
import type { PlatformActor } from "./platform-actor.js";

/**
 * Organization n'est pas un modèle tenant-scoped (pas de colonne tenantId) — le
 * client gardé `prisma` suffit, pas de bootstrap rawPrisma nécessaire. Comme les
 * tranches 3-6, gérer une organisation n'est pas le type d'intervention que §31
 * rend explicitement obligatoire de justifier : la justification reste optionnelle.
 */

async function auditOrganization(
  actor: PlatformActor,
  action: string,
  organization: Organization,
  beforeData: Prisma.InputJsonValue | undefined,
  afterData: Prisma.InputJsonValue,
): Promise<void> {
  await recordAuditLog({
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action,
    entityType: "Organization",
    entityId: organization.id,
    ...(beforeData !== undefined ? { beforeData } : {}),
    afterData,
    ...(actor.justification ? { justification: actor.justification } : {}),
  });
}

async function requireCountryExists(countryId: string): Promise<void> {
  const country = await prisma.country.findUnique({ where: { id: countryId } });
  if (!country) {
    throw new AppError(404, "COUNTRY_NOT_FOUND", `Country not found: ${countryId}`);
  }
}

export async function listOrganizations(query: ListOrganizationsQuery): Promise<Organization[]> {
  return prisma.organization.findMany({
    where: {
      deletedAt: null,
      ...(query.type !== undefined ? { type: query.type } : {}),
    },
    orderBy: { name: "asc" },
  });
}

export async function createOrganization(
  input: CreateOrganizationInput,
  actor: PlatformActor,
): Promise<Organization> {
  if (input.countryId) {
    await requireCountryExists(input.countryId);
  }

  const organization = await prisma.organization.create({
    data: {
      name: input.name,
      type: input.type,
      ...(input.countryId !== undefined ? { countryId: input.countryId } : {}),
      ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
      ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
    },
  });

  await auditOrganization(actor, "organization.create", organization, undefined, {
    name: organization.name,
    type: organization.type,
  });
  return organization;
}

export async function requireOrganization(id: string): Promise<Organization> {
  const organization = await prisma.organization.findUnique({ where: { id } });
  if (!organization || organization.deletedAt) {
    throw new AppError(404, "ORGANIZATION_NOT_FOUND", `Organization not found: ${id}`);
  }
  return organization;
}

export async function updateOrganization(
  id: string,
  input: UpdateOrganizationInput,
  actor: PlatformActor,
): Promise<Organization> {
  const before = await requireOrganization(id);
  if (input.countryId) {
    await requireCountryExists(input.countryId);
  }

  const updated = await prisma.organization.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.countryId !== undefined ? { countryId: input.countryId } : {}),
      ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail } : {}),
      ...(input.contactPhone !== undefined ? { contactPhone: input.contactPhone } : {}),
    },
  });

  await auditOrganization(
    actor,
    "organization.update",
    updated,
    { name: before.name, type: before.type },
    { name: updated.name, type: updated.type },
  );
  return updated;
}

export async function deleteOrganization(id: string, actor: PlatformActor): Promise<void> {
  await requireOrganization(id);

  const updated = await prisma.organization.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await auditOrganization(actor, "organization.delete", updated, undefined, { deleted: true });
}
