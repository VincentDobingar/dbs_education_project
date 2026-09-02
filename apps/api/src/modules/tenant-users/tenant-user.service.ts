import { randomBytes } from "node:crypto";

import type { MembershipStatus, Role } from "@prisma/client";

import { recordAuditLog } from "../../lib/audit-log.js";
import { getEffectivePermissionCodes } from "../../lib/authorization.js";
import { AppError } from "../../lib/errors.js";
import { hashPassword } from "../../lib/password.js";
import { prisma, rawPrisma, withTenantSession } from "../../lib/prisma.js";
import type { TenantActor } from "../../lib/tenant-actor.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { InviteTenantUserInput } from "./tenant-user.validation.js";

export interface TenantUserSummary {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  membershipStatus: MembershipStatus;
  roleCodes: string[];
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

/**
 * Permissions that represent control over the institution itself (its money, its
 * staff records/payroll, its subscription, its settings) rather than day-to-day
 * content operations (grades, attendance, homework, ...). Roles are deliberately
 * NOT permission-supersets of one another in this catalog — e.g. SCHOOL_OWNER has
 * no grades.write/attendance.write/discipline.write, those are TEACHER's job to
 * perform directly — so a full-permission-subset check would wrongly block an
 * owner from appointing a teacher. Only these institution-governance permissions
 * need guarding against escalation.
 */
const GOVERNANCE_PERMISSION_CODES = new Set([
  "tenant.settings.manage",
  "finance.write",
  "hr.manage",
  "hr.salary.manage",
  "subscriptions.manage",
]);

/**
 * §17 : `tenant.settings.manage` gates *who can manage membership*, not *which
 * privileges they can hand out* — without this check, any granter holding that one
 * permission (e.g. SCHOOL_ADMIN) could invite or promote someone straight to
 * SCHOOL_OWNER, picking up finance.write/hr.manage/hr.salary.manage/
 * subscriptions.manage they themselves don't hold. A role is only grantable if it
 * doesn't carry a governance permission the granter lacks.
 */
async function requireGrantableRole(role: Role, granterUserId: string, tenantId: string): Promise<void> {
  const [targetPermissions, granterPermissions] = await Promise.all([
    rawPrisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permission: { select: { code: true } } },
    }),
    getEffectivePermissionCodes(granterUserId, tenantId),
  ]);

  const excessGovernancePermissions = targetPermissions
    .map((rolePermission) => rolePermission.permission.code)
    .filter((code) => GOVERNANCE_PERMISSION_CODES.has(code) && !granterPermissions.has(code));

  if (excessGovernancePermissions.length > 0) {
    throw new AppError(
      403,
      "ROLE_EXCEEDS_GRANTER_PERMISSIONS",
      `Cannot grant role ${role.code}: it includes permissions you do not hold (${excessGovernancePermissions.join(", ")})`,
    );
  }
}

/**
 * Adds a member to the current tenant, creating their platform User account first
 * if one doesn't exist yet under that email. There is no email-delivery flow wired
 * up (same gap documented as a TODO on auth.service.ts's registerUser, §34) — a
 * freshly created account gets a random, unknown password and must go through
 * password reset before it can log in.
 */
export async function inviteTenantUser(
  input: InviteTenantUserInput,
  inviterUserId: string,
): Promise<TenantUserSummary> {
  const tenantId = requireCurrentTenantId();
  const role = await requireTenantRole(input.roleCode);
  await requireGrantableRole(role, inviterUserId, tenantId);

  const existingUser = await rawPrisma.user.findUnique({
    where: { email: input.email },
    include: { profile: true },
  });

  const userId = existingUser
    ? existingUser.id
    : await (async () => {
        if (!input.firstName || !input.lastName) {
          throw new AppError(
            400,
            "NAME_REQUIRED",
            "firstName and lastName are required to create a new account",
          );
        }
        const passwordHash = await hashPassword(randomBytes(24).toString("base64url"));
        const created = await rawPrisma.user.create({
          data: {
            email: input.email,
            passwordHash,
            status: "PENDING",
            profile: { create: { firstName: input.firstName, lastName: input.lastName } },
          },
        });
        return created.id;
      })();

  const existingMembership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
  });
  if (existingMembership) {
    throw new AppError(409, "ALREADY_MEMBER", "This user is already a member of this tenant");
  }

  await withTenantSession(tenantId, async (tx) => {
    await tx.tenantMembership.create({ data: { userId, tenantId, status: "ACTIVE", joinedAt: new Date() } });
    await tx.userRole.create({ data: { userId, roleId: role.id, tenantId } });
  });

  const profile = existingUser?.profile ?? (await rawPrisma.userProfile.findUnique({ where: { userId } }));

  return {
    userId,
    email: input.email,
    firstName: profile?.firstName ?? input.firstName ?? "",
    lastName: profile?.lastName ?? input.lastName ?? "",
    membershipStatus: "ACTIVE",
    roleCodes: [role.code],
  };
}

export async function listTenantUsers(): Promise<TenantUserSummary[]> {
  const tenantId = requireCurrentTenantId();

  const memberships = await prisma.tenantMembership.findMany({
    include: { user: { include: { profile: true } } },
    orderBy: { createdAt: "asc" },
  });

  const roles = await rawPrisma.userRole.findMany({
    where: { tenantId, userId: { in: memberships.map((membership) => membership.userId) } },
    include: { role: true },
  });

  return memberships.map((membership) => ({
    userId: membership.userId,
    email: membership.user.email,
    firstName: membership.user.profile?.firstName ?? "",
    lastName: membership.user.profile?.lastName ?? "",
    membershipStatus: membership.status,
    roleCodes: roles.filter((r) => r.userId === membership.userId).map((r) => r.role.code),
  }));
}

async function requireMembership(userId: string): Promise<void> {
  const tenantId = requireCurrentTenantId();
  const membership = await prisma.tenantMembership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
  });
  if (!membership) {
    throw new AppError(404, "MEMBER_NOT_FOUND", `User ${userId} is not a member of this tenant`);
  }
}

/** Finalisation Phase 2 : attribuer/révoquer un rôle ou changer le statut d'un
 * membership est une action tenant-interne sensible (RBAC) — auditée via
 * `recordAuditLog`, contrairement au reste de ce fichier (invitation, lecture). */
export async function grantTenantRole(userId: string, roleCode: string, actor: TenantActor): Promise<void> {
  const tenantId = requireCurrentTenantId();
  await requireMembership(userId);
  const role = await requireTenantRole(roleCode);
  await requireGrantableRole(role, actor.actorUserId, tenantId);

  const existing = await rawPrisma.userRole.findUnique({
    where: { userId_roleId_tenantId: { userId, roleId: role.id, tenantId } },
  });
  if (existing) {
    throw new AppError(409, "ROLE_ALREADY_GRANTED", `User already has role ${roleCode} on this tenant`);
  }

  const userRole = await rawPrisma.userRole.create({ data: { userId, roleId: role.id, tenantId } });

  await recordAuditLog({
    tenantId,
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action: "tenant_user.role_grant",
    entityType: "UserRole",
    entityId: userRole.id,
    afterData: { userId, roleCode },
  });
}

export async function revokeTenantRole(userId: string, roleCode: string, actor: TenantActor): Promise<void> {
  const tenantId = requireCurrentTenantId();
  await requireMembership(userId);
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
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action: "tenant_user.role_revoke",
    entityType: "UserRole",
    entityId: existing.id,
    beforeData: { userId, roleCode },
  });
}

export async function updateMembershipStatus(
  userId: string,
  status: MembershipStatus,
  actor: TenantActor,
): Promise<void> {
  await requireMembership(userId);
  const tenantId = requireCurrentTenantId();

  const before = await prisma.tenantMembership.findUniqueOrThrow({
    where: { userId_tenantId: { userId, tenantId } },
  });

  const updated = await prisma.tenantMembership.update({
    where: { userId_tenantId: { userId, tenantId } },
    data: { status },
  });

  await recordAuditLog({
    tenantId,
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action: "tenant_user.membership_status_update",
    entityType: "TenantMembership",
    entityId: updated.id,
    beforeData: { status: before.status },
    afterData: { status: updated.status },
  });
}
