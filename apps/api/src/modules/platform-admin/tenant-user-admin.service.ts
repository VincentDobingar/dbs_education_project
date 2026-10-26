import { randomBytes } from "node:crypto";

import type { MembershipStatus, Role } from "@prisma/client";

import { recordAuditLog } from "../../lib/audit-log.js";
import { AppError } from "../../lib/errors.js";
import { hashPassword } from "../../lib/password.js";
import { rawPrisma, withTenantSession } from "../../lib/prisma.js";
import { requestPasswordReset } from "../auth/auth.service.js";

import type { PlatformActor } from "./platform-actor.js";
import { requirePlatformTenant } from "./tenant-admin.service.js";
import type { InvitePlatformTenantUserInput } from "./tenant-user-admin.validation.js";

/**
 * Gestion des comptes d'un établissement depuis la super-administration (et non plus
 * depuis l'établissement lui-même) : liste, ajout avec un rôle, rôles, statut. Même
 * garde-fous que §31 — rôle plateforme (routes), justification et journal d'audit
 * sur chaque écriture. TenantMembership étant protégé par RLS, toute lecture ou
 * écriture passe par withTenantSession, comme tenant-elevation-admin.service.ts.
 */

export interface PlatformTenantUser {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  accountStatus: string;
  membershipStatus: MembershipStatus;
  roleCodes: string[];
  lastLoginAt: Date | null;
}

async function requireTenantRole(roleCode: string): Promise<Role> {
  const role = await rawPrisma.role.findUnique({ where: { code: roleCode } });
  if (!role) {
    throw new AppError(404, "ROLE_NOT_FOUND", `Unknown role: ${roleCode}`);
  }
  if (role.scope !== "TENANT") {
    throw new AppError(400, "INVALID_ROLE_SCOPE", `Role ${roleCode} is not a tenant-scoped role`);
  }
  return role;
}

async function requireMembership(tenantId: string, userId: string) {
  const membership = await withTenantSession(tenantId, (tx) =>
    tx.tenantMembership.findUnique({ where: { userId_tenantId: { userId, tenantId } } }),
  );
  if (!membership) {
    throw new AppError(404, "MEMBER_NOT_FOUND", `User ${userId} is not a member of this tenant`);
  }
  return membership;
}

function auditActor(actor: PlatformActor) {
  return {
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    justification: actor.justification,
  };
}

export async function listPlatformTenantUsers(tenantId: string): Promise<PlatformTenantUser[]> {
  await requirePlatformTenant(tenantId);

  const memberships = await withTenantSession(tenantId, (tx) =>
    tx.tenantMembership.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
  );
  const userIds = memberships.map((membership) => membership.userId);

  const [users, roles] = await Promise.all([
    rawPrisma.user.findMany({ where: { id: { in: userIds } }, include: { profile: true } }),
    rawPrisma.userRole.findMany({
      where: {
        tenantId,
        userId: { in: userIds },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { role: true },
    }),
  ]);
  const usersById = new Map(users.map((user) => [user.id, user]));

  return memberships.flatMap((membership) => {
    const user = usersById.get(membership.userId);
    if (!user) {
      return [];
    }
    return [
      {
        userId: user.id,
        email: user.email,
        firstName: user.profile?.firstName ?? "",
        lastName: user.profile?.lastName ?? "",
        accountStatus: user.status,
        membershipStatus: membership.status,
        roleCodes: roles.filter((r) => r.userId === user.id).map((r) => r.role.code),
        lastLoginAt: user.lastLoginAt ?? null,
      },
    ];
  });
}

/**
 * Ajoute une personne à l'établissement avec un rôle, en créant son compte si
 * l'adresse est inconnue (mot de passe aléatoire jamais communiqué). Le compte
 * reçoit ensuite le lien « choisir un mot de passe » par e-mail (même flux que
 * « mot de passe oublié ») — aucun mot de passe ne transite par l'administrateur.
 */
export async function invitePlatformTenantUser(
  tenantId: string,
  input: InvitePlatformTenantUserInput,
  actor: PlatformActor,
): Promise<{ userId: string; created: boolean }> {
  await requirePlatformTenant(tenantId);
  const role = await requireTenantRole(input.roleCode);
  const email = input.email.trim().toLowerCase();

  const existingUser = await rawPrisma.user.findUnique({ where: { email } });
  let userId: string;
  if (existingUser) {
    userId = existingUser.id;
  } else {
    if (!input.firstName || !input.lastName) {
      throw new AppError(400, "NAME_REQUIRED", "firstName and lastName are required to create a new account");
    }
    const created = await rawPrisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(randomBytes(24).toString("base64url")),
        status: "PENDING",
        profile: { create: { firstName: input.firstName, lastName: input.lastName } },
      },
    });
    userId = created.id;
  }

  const existingMembership = await withTenantSession(tenantId, (tx) =>
    tx.tenantMembership.findUnique({ where: { userId_tenantId: { userId, tenantId } } }),
  );
  if (existingMembership) {
    throw new AppError(409, "ALREADY_MEMBER", "This user is already a member of this tenant");
  }

  await withTenantSession(tenantId, async (tx) => {
    await tx.tenantMembership.create({ data: { userId, tenantId, status: "ACTIVE", joinedAt: new Date() } });
  });
  const userRole = await rawPrisma.userRole.create({
    data: { userId, roleId: role.id, tenantId, grantedById: actor.actorUserId },
  });

  await recordAuditLog({
    tenantId,
    ...auditActor(actor),
    action: "platform_tenant_user.invite",
    entityType: "UserRole",
    entityId: userRole.id,
    afterData: { userId, email, roleCode: role.code, accountCreated: !existingUser },
  });

  if (input.sendAccessEmail) {
    await requestPasswordReset(email, "staff", input.locale);
  }

  return { userId, created: !existingUser };
}

export async function grantPlatformTenantRole(
  tenantId: string,
  userId: string,
  roleCode: string,
  actor: PlatformActor,
): Promise<void> {
  await requirePlatformTenant(tenantId);
  await requireMembership(tenantId, userId);
  const role = await requireTenantRole(roleCode);

  const existing = await rawPrisma.userRole.findUnique({
    where: { userId_roleId_tenantId: { userId, roleId: role.id, tenantId } },
  });
  if (existing && (existing.expiresAt === null || existing.expiresAt > new Date())) {
    throw new AppError(409, "ROLE_ALREADY_GRANTED", `User already has role ${roleCode} on this tenant`);
  }

  const userRole = existing
    ? await rawPrisma.userRole.update({
        where: { id: existing.id },
        data: { expiresAt: null, grantedAt: new Date(), grantedById: actor.actorUserId },
      })
    : await rawPrisma.userRole.create({
        data: { userId, roleId: role.id, tenantId, grantedById: actor.actorUserId },
      });

  await recordAuditLog({
    tenantId,
    ...auditActor(actor),
    action: "platform_tenant_user.role_grant",
    entityType: "UserRole",
    entityId: userRole.id,
    afterData: { userId, roleCode },
  });
}

export async function revokePlatformTenantRole(
  tenantId: string,
  userId: string,
  roleCode: string,
  actor: PlatformActor,
): Promise<void> {
  await requirePlatformTenant(tenantId);
  await requireMembership(tenantId, userId);
  const role = await requireTenantRole(roleCode);

  const existing = await rawPrisma.userRole.findUnique({
    where: { userId_roleId_tenantId: { userId, roleId: role.id, tenantId } },
  });
  if (!existing) {
    throw new AppError(404, "ROLE_NOT_GRANTED", `User does not have role ${roleCode} on this tenant`);
  }

  await rawPrisma.userRole.delete({ where: { id: existing.id } });

  await recordAuditLog({
    tenantId,
    ...auditActor(actor),
    action: "platform_tenant_user.role_revoke",
    entityType: "UserRole",
    entityId: existing.id,
    beforeData: { userId, roleCode },
  });
}

export async function updatePlatformTenantMembershipStatus(
  tenantId: string,
  userId: string,
  status: MembershipStatus,
  actor: PlatformActor,
): Promise<void> {
  await requirePlatformTenant(tenantId);
  const before = await requireMembership(tenantId, userId);

  const updated = await withTenantSession(tenantId, (tx) =>
    tx.tenantMembership.update({ where: { userId_tenantId: { userId, tenantId } }, data: { status } }),
  );

  await recordAuditLog({
    tenantId,
    ...auditActor(actor),
    action: "platform_tenant_user.membership_status_update",
    entityType: "TenantMembership",
    entityId: updated.id,
    beforeData: { status: before.status },
    afterData: { status: updated.status },
  });
}

/** Renvoie le lien « choisir un mot de passe » (compte qui n'a jamais reçu ou a perdu son accès). */
export async function sendPlatformTenantUserAccessEmail(
  tenantId: string,
  userId: string,
  locale: "fr" | "en",
  actor: PlatformActor,
): Promise<void> {
  await requirePlatformTenant(tenantId);
  await requireMembership(tenantId, userId);
  const user = await rawPrisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", `User not found: ${userId}`);
  }

  await requestPasswordReset(user.email, "staff", locale);

  await recordAuditLog({
    tenantId,
    ...auditActor(actor),
    action: "platform_tenant_user.access_email",
    entityType: "User",
    entityId: userId,
  });
}
