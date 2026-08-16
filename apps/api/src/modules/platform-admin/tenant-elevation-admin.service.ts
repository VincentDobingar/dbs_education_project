import type { Role, UserRole } from "@prisma/client";

import { recordAuditLog } from "../../lib/audit-log.js";
import { AppError } from "../../lib/errors.js";
import { rawPrisma } from "../../lib/prisma.js";

import type { PlatformActor } from "./platform-actor.js";
import { requirePlatformTenant } from "./tenant-admin.service.js";
import type { ElevateInTenantInput } from "./tenant-elevation-admin.validation.js";

/**
 * §31 dernier volet transversal restant après la tranche 10 : toute intervention d'un
 * administrateur global DANS UN TENANT doit être autorisée, justifiée, limitée dans le
 * temps, journalisée, et respecter le moindre privilège. Autorisation/justification/audit/
 * moindre privilège sont déjà couverts par les tranches précédentes (requirePlatformRole,
 * justifiedActionSchema, recordAuditLog) ; "limité dans le temps" restait à exercer :
 * `UserRole.expiresAt` existe au schéma mais rien ne l'écrivait. L'élévation ici accorde à
 * l'acteur lui-même (jamais à un tiers) un rôle tenant-scoped avec expiration — le contrôle
 * d'accès (`activeRoleCodes`, lib/authorization.ts) ignore déjà les lignes expirées, donc
 * l'application-level enforcement du "limité dans le temps" est gratuite une fois la ligne
 * écrite avec un `expiresAt`.
 */

async function requireTenantScopedRole(roleCode: string): Promise<Role> {
  const role = await rawPrisma.role.findUnique({ where: { code: roleCode } });
  if (!role) {
    throw new AppError(404, "ROLE_NOT_FOUND", `Unknown role: ${roleCode}`);
  }
  if (role.scope !== "TENANT") {
    throw new AppError(400, "INVALID_ROLE_SCOPE", `Role ${roleCode} is not a tenant-scoped role`);
  }
  return role;
}

export async function listTenantElevations(tenantId: string): Promise<UserRole[]> {
  await requirePlatformTenant(tenantId);
  return rawPrisma.userRole.findMany({
    where: { tenantId, expiresAt: { not: null } },
    orderBy: { grantedAt: "desc" },
  });
}

export async function elevateInTenant(
  tenantId: string,
  input: ElevateInTenantInput,
  actor: PlatformActor,
): Promise<UserRole> {
  await requirePlatformTenant(tenantId);
  const role = await requireTenantScopedRole(input.roleCode);

  const existing = await rawPrisma.userRole.findUnique({
    where: { userId_roleId_tenantId: { userId: actor.actorUserId, roleId: role.id, tenantId } },
  });
  if (existing && (existing.expiresAt === null || existing.expiresAt > new Date())) {
    throw new AppError(
      409,
      "ELEVATION_ALREADY_ACTIVE",
      `Already holds an active elevation for role ${input.roleCode} on this tenant`,
    );
  }

  const expiresAt = new Date(Date.now() + input.durationHours * 60 * 60 * 1000);
  const elevation = await rawPrisma.userRole.upsert({
    where: { userId_roleId_tenantId: { userId: actor.actorUserId, roleId: role.id, tenantId } },
    create: {
      userId: actor.actorUserId,
      roleId: role.id,
      tenantId,
      expiresAt,
      justification: actor.justification,
      grantedById: actor.actorUserId,
    },
    update: {
      expiresAt,
      justification: actor.justification,
      grantedAt: new Date(),
      grantedById: actor.actorUserId,
    },
  });

  await recordAuditLog({
    tenantId,
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action: "platform_elevation.grant",
    entityType: "UserRole",
    entityId: elevation.id,
    afterData: { roleCode: role.code, expiresAt: expiresAt.toISOString() },
    justification: actor.justification,
  });

  return elevation;
}

export async function revokeElevation(
  tenantId: string,
  userRoleId: string,
  actor: PlatformActor,
): Promise<void> {
  await requirePlatformTenant(tenantId);
  const elevation = await rawPrisma.userRole.findUnique({ where: { id: userRoleId } });
  if (!elevation || elevation.tenantId !== tenantId || elevation.expiresAt === null) {
    throw new AppError(404, "ELEVATION_NOT_FOUND", `No temporary elevation found: ${userRoleId}`);
  }
  if (elevation.expiresAt <= new Date()) {
    throw new AppError(409, "ELEVATION_ALREADY_EXPIRED", "This elevation has already expired");
  }

  const now = new Date();
  await rawPrisma.userRole.update({ where: { id: userRoleId }, data: { expiresAt: now } });

  await recordAuditLog({
    tenantId,
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action: "platform_elevation.revoke",
    entityType: "UserRole",
    entityId: userRoleId,
    beforeData: { expiresAt: elevation.expiresAt.toISOString() },
    afterData: { expiresAt: now.toISOString() },
    justification: actor.justification,
  });
}
