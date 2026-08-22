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
