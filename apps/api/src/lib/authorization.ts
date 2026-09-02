import { prisma } from "./prisma.js";

/** Active (non-expired) role codes a user holds in a given scope. tenantId=null => platform scope. */
async function activeRoleCodes(userId: string, tenantId: string | null): Promise<string[]> {
  const userRoles = await prisma.userRole.findMany({
    where: {
      userId,
      tenantId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { role: { select: { code: true } } },
  });

  return userRoles.map((userRole) => userRole.role.code);
}

export async function userHasPlatformRole(userId: string, allowedCodes: readonly string[]): Promise<boolean> {
  const codes = await activeRoleCodes(userId, null);
  return codes.some((code) => allowedCodes.includes(code));
}

/** §31 : le(s) rôle(s) plateforme actifs d'un utilisateur, pour la piste d'audit (actorRoleCode). */
export async function getPlatformRoleCodes(userId: string): Promise<string[]> {
  return activeRoleCodes(userId, null);
}

/** Finalisation Phase 2 : le(s) rôle(s) tenant actifs d'un utilisateur, pour la piste
 * d'audit des actions tenant-internes sensibles (actorRoleCode). */
export async function getTenantRoleCodes(userId: string, tenantId: string): Promise<string[]> {
  return activeRoleCodes(userId, tenantId);
}

/**
 * The full set of permission codes granted by all of a user's active roles in a
 * given scope — used to check that a role being granted to someone else doesn't
 * exceed what the granter themselves is allowed to do (§17: tenant.settings.manage
 * only permits *managing membership*, not conferring privileges the granter
 * doesn't hold).
 */
export async function getEffectivePermissionCodes(
  userId: string,
  tenantId: string | null,
): Promise<Set<string>> {
  const userRoles = await prisma.userRole.findMany({
    where: {
      userId,
      tenantId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { roleId: true },
  });

  if (userRoles.length === 0) {
    return new Set();
  }

  const rolePermissions = await prisma.rolePermission.findMany({
    where: { roleId: { in: userRoles.map((userRole) => userRole.roleId) } },
    select: { permission: { select: { code: true } } },
  });

  return new Set(rolePermissions.map((rolePermission) => rolePermission.permission.code));
}

export async function userHasPermission(
  userId: string,
  tenantId: string | null,
  permissionCode: string,
): Promise<boolean> {
  const userRoles = await prisma.userRole.findMany({
    where: {
      userId,
      tenantId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { roleId: true },
  });

  if (userRoles.length === 0) {
    return false;
  }

  const match = await prisma.rolePermission.findFirst({
    where: {
      roleId: { in: userRoles.map((userRole) => userRole.roleId) },
      permission: { code: permissionCode },
    },
  });

  return match !== null;
}
