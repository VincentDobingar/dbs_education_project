import type { Tenant } from "@prisma/client";

import { recordAuditLog } from "../../lib/audit-log.js";
import { AppError } from "../../lib/errors.js";
import { rawPrisma } from "../../lib/prisma.js";

import type { PlatformActor } from "./platform-actor.js";
import type { ListPlatformTenantsQuery } from "./tenant-admin.validation.js";

/** Lecture cross-tenant légitime (§31) : la super-administration voit tous les tenants. */
export async function listPlatformTenants(query: ListPlatformTenantsQuery): Promise<Tenant[]> {
  return rawPrisma.tenant.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { legalName: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function requirePlatformTenant(id: string): Promise<Tenant> {
  const tenant = await rawPrisma.tenant.findUnique({ where: { id } });
  if (!tenant) {
    throw new AppError(404, "TENANT_NOT_FOUND", `Tenant not found: ${id}`);
  }
  return tenant;
}

const SUSPENDABLE_STATUSES = new Set(["VERIFIED", "TRIAL", "ACTIVE"]);

/** §31 : chaque transition est autorisée (déjà vérifié par requirePlatformRole), justifiée et journalisée. */
async function transitionTenant(
  id: string,
  tenant: Tenant,
  data: {
    status: Tenant["status"];
    verifiedAt?: Date;
    suspendedAt?: Date | null;
    suspendedReason?: string | null;
  },
  action: string,
  actor: PlatformActor,
): Promise<Tenant> {
  const updated = await rawPrisma.tenant.update({ where: { id }, data });

  await recordAuditLog({
    tenantId: id,
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action,
    entityType: "Tenant",
    entityId: id,
    beforeData: { status: tenant.status },
    afterData: { status: updated.status },
    justification: actor.justification,
  });

  return updated;
}

export async function verifyTenant(id: string, actor: PlatformActor): Promise<Tenant> {
  const tenant = await requirePlatformTenant(id);
  if (tenant.status !== "PENDING_VERIFICATION") {
    throw new AppError(
      409,
      "TENANT_NOT_PENDING_VERIFICATION",
      "Only a tenant pending verification can be verified",
    );
  }
  return transitionTenant(id, tenant, { status: "VERIFIED", verifiedAt: new Date() }, "tenant.verify", actor);
}

export async function rejectTenant(id: string, actor: PlatformActor): Promise<Tenant> {
  const tenant = await requirePlatformTenant(id);
  if (tenant.status !== "PENDING_VERIFICATION") {
    throw new AppError(
      409,
      "TENANT_NOT_PENDING_VERIFICATION",
      "Only a tenant pending verification can be rejected",
    );
  }
  return transitionTenant(id, tenant, { status: "REJECTED" }, "tenant.reject", actor);
}

export async function suspendTenant(id: string, actor: PlatformActor): Promise<Tenant> {
  const tenant = await requirePlatformTenant(id);
  if (!SUSPENDABLE_STATUSES.has(tenant.status)) {
    throw new AppError(409, "TENANT_NOT_SUSPENDABLE", `Cannot suspend a tenant with status ${tenant.status}`);
  }
  return transitionTenant(
    id,
    tenant,
    { status: "SUSPENDED", suspendedAt: new Date(), suspendedReason: actor.justification },
    "tenant.suspend",
    actor,
  );
}

export async function reactivateTenant(id: string, actor: PlatformActor): Promise<Tenant> {
  const tenant = await requirePlatformTenant(id);
  if (tenant.status !== "SUSPENDED") {
    throw new AppError(409, "TENANT_NOT_SUSPENDED", "Only a suspended tenant can be reactivated");
  }
  return transitionTenant(
    id,
    tenant,
    { status: "ACTIVE", suspendedAt: null, suspendedReason: null },
    "tenant.reactivate",
    actor,
  );
}
