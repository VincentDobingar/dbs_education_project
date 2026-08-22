import type { ActivationInvitation, ParentStudentRelationship, StudentUserLink } from "@prisma/client";

import {
  ACTIVATION_CODE_TTL_MS,
  generateActivationCode,
  hashActivationCode,
} from "../../lib/activation-code.js";
import { recordAuditLog } from "../../lib/audit-log.js";
import { sendEmail } from "../../lib/email-provider/send-email.js";
import { AppError } from "../../lib/errors.js";
import { prisma, rawPrisma, withTenantSession } from "../../lib/prisma.js";
import { sendSms } from "../../lib/sms-provider/send-sms.js";
import type { TenantActor } from "../../lib/tenant-actor.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";
import { requireStudentRecord } from "../students/student.service.js";

import type { CreateInvitationInput, ListInvitationsQuery } from "./activation-invitation.validation.js";
import { assertChildLimitNotReached } from "./family-account.service.js";

export interface CreatedInvitation {
  invitation: ActivationInvitation;
  code: string;
}

/**
 * The code is handed back in the response, once, in clear text (§8), AND sent via
 * sendEmail/sendSms (§28) to whichever of invitedEmail/invitedPhone was given —
 * both channels coexist: sendEmail/sendSms no-op until a real SMTP/Twilio provider
 * is configured (lib/notification-channels.ts), so "staff transmit it manually"
 * remains the fallback exactly as before until one actually is.
 */
export async function createInvitation(
  input: CreateInvitationInput,
  actingUserId: string,
): Promise<CreatedInvitation> {
  await requireStudentRecord(input.studentId);
  const tenantId = requireCurrentTenantId();
  const expiresAt = new Date(Date.now() + ACTIVATION_CODE_TTL_MS);

  const invitation = await prisma.activationInvitation.create({
    data: {
      tenantId,
      studentId: input.studentId,
      beneficiaryCategory: input.beneficiaryCategory,
      createdByUserId: actingUserId,
      status: "SENT",
      expiresAt,
      ...(input.invitedEmail ? { invitedEmail: input.invitedEmail } : {}),
      ...(input.invitedPhone ? { invitedPhone: input.invitedPhone } : {}),
    },
  });

  const { code, hash } = generateActivationCode();
  await prisma.activationCode.create({
    data: { invitationId: invitation.id, codeHash: hash, expiresAt },
  });

  if (invitation.invitedEmail) {
    sendEmail({
      to: invitation.invitedEmail,
      subject: "Your EduManage activation code",
      text: `You've been invited to access EduManage. Your activation code is: ${code}\nThis code expires on ${expiresAt.toISOString()}.`,
    });
  }
  if (invitation.invitedPhone) {
    sendSms({
      to: invitation.invitedPhone,
      body: `Your EduManage activation code is: ${code} (expires ${expiresAt.toISOString().slice(0, 10)})`,
    });
  }

  return { invitation, code };
}

export async function listInvitations(query: ListInvitationsQuery): Promise<ActivationInvitation[]> {
  return prisma.activationInvitation.findMany({
    where: { ...(query.studentId ? { studentId: query.studentId } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

async function requireInvitation(id: string): Promise<ActivationInvitation> {
  const invitation = await prisma.activationInvitation.findUnique({ where: { id } });
  if (!invitation) {
    throw new AppError(404, "INVITATION_NOT_FOUND", `Activation invitation not found: ${id}`);
  }
  return invitation;
}

/** Finalisation Phase 2 : révoquer une invitation d'activation est une action
 * tenant-interne sensible (§8, coupe l'accès d'un futur bénéficiaire) — auditée. */
export async function revokeInvitation(id: string, actor: TenantActor): Promise<ActivationInvitation> {
  const invitation = await requireInvitation(id);
  if (invitation.status === "USED") {
    throw new AppError(409, "INVITATION_ALREADY_USED", "This invitation has already been used");
  }
  if (invitation.status === "REVOKED") {
    throw new AppError(409, "INVITATION_ALREADY_REVOKED", "This invitation is already revoked");
  }

  await prisma.activationCode.updateMany({
    where: { invitationId: id, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const revoked = await prisma.activationInvitation.update({
    where: { id },
    data: { status: "REVOKED" },
  });

  await recordAuditLog({
    tenantId: revoked.tenantId,
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action: "activation_invitation.revoke",
    entityType: "ActivationInvitation",
    entityId: revoked.id,
    beforeData: { status: invitation.status },
    afterData: { status: revoked.status },
  });

  return revoked;
}

export interface RedeemedActivation {
  beneficiaryCategory: "PARENT" | "STUDENT";
  relationship?: ParentStudentRelationship;
  studentLink?: StudentUserLink;
}

/**
 * The redeeming user has no tenant membership for the child's tenant yet (§8, §9) —
 * everything up to the code lookup runs on rawPrisma (same "bootstrap lookup" case
 * documented on rawPrisma itself: we must find out which tenant this concerns before
 * any tenant context can be established). The actual writes then run inside
 * withTenantSession, locked to the invitation's tenant, atomically.
 */
export async function redeemActivation(
  codePlaintext: string,
  actingUserId: string,
): Promise<RedeemedActivation> {
  const hash = hashActivationCode(codePlaintext);
  const code = await rawPrisma.activationCode.findUnique({ where: { codeHash: hash } });
  if (!code || code.revokedAt) {
    throw new AppError(400, "ACTIVATION_CODE_INVALID", "Invalid or revoked activation code");
  }
  if (code.usedAt) {
    throw new AppError(409, "ACTIVATION_CODE_ALREADY_USED", "This activation code has already been used");
  }
  if (code.expiresAt < new Date()) {
    throw new AppError(400, "ACTIVATION_CODE_EXPIRED", "This activation code has expired");
  }

  const invitation = await rawPrisma.activationInvitation.findUnique({ where: { id: code.invitationId } });
  if (!invitation || invitation.status === "REVOKED" || invitation.status === "EXPIRED") {
    throw new AppError(400, "INVITATION_NOT_ACTIVE", "This invitation is no longer active");
  }

  const actingUser = await rawPrisma.user.findUniqueOrThrow({ where: { id: actingUserId } });
  const emailMismatch =
    invitation.invitedEmail && invitation.invitedEmail.toLowerCase() !== actingUser.email.toLowerCase();
  const phoneMismatch =
    !invitation.invitedEmail && invitation.invitedPhone && invitation.invitedPhone !== actingUser.phone;
  if (emailMismatch || phoneMismatch) {
    throw new AppError(403, "BENEFICIARY_MISMATCH", "This activation code was not issued to your account");
  }

  return withTenantSession(invitation.tenantId, async (tx) => {
    const claim = await tx.activationCode.updateMany({
      where: { id: code.id, usedAt: null, revokedAt: null },
      data: { usedAt: new Date() },
    });
    if (claim.count === 0) {
      throw new AppError(409, "ACTIVATION_CODE_ALREADY_USED", "This activation code has already been used");
    }

    await tx.activationInvitation.update({ where: { id: invitation.id }, data: { status: "USED" } });

    if (invitation.beneficiaryCategory === "STUDENT") {
      const existingLink = await tx.studentUserLink.findUnique({
        where: { studentId: invitation.studentId },
      });
      if (existingLink) {
        throw new AppError(409, "STUDENT_ALREADY_LINKED", "This student account is already linked");
      }

      const studentLink = await tx.studentUserLink.create({
        data: { tenantId: invitation.tenantId, studentId: invitation.studentId, userId: actingUserId },
      });
      return { beneficiaryCategory: "STUDENT" as const, studentLink };
    }

    const existingRelationship = await tx.parentStudentRelationship.findUnique({
      where: { parentUserId_studentId: { parentUserId: actingUserId, studentId: invitation.studentId } },
    });
    if (
      existingRelationship &&
      existingRelationship.status === "VERIFIED" &&
      !existingRelationship.revokedAt
    ) {
      throw new AppError(
        409,
        "RELATIONSHIP_ALREADY_VERIFIED",
        "This parent is already linked to this student",
      );
    }

    // §9 : le plafond d'un abonnement familial se compte sur TOUS les enfants
    // vérifiés du parent, tous tenants confondus — ParentStudentRelationship n'a
    // pas de RLS (même précédent que TenantDomain), donc ce count() n'est pas
    // limité au tenant verrouillé par cette session malgré le `tx` en cours.
    const verifiedChildrenCount = await tx.parentStudentRelationship.count({
      where: { parentUserId: actingUserId, status: "VERIFIED", revokedAt: null },
    });
    await assertChildLimitNotReached(actingUserId, verifiedChildrenCount);

    const relationship = existingRelationship
      ? await tx.parentStudentRelationship.update({
          where: { id: existingRelationship.id },
          data: {
            status: "VERIFIED",
            verifiedAt: new Date(),
            revokedAt: null,
            revokedById: null,
            revokedReason: null,
          },
        })
      : await tx.parentStudentRelationship.create({
          data: {
            tenantId: invitation.tenantId,
            parentUserId: actingUserId,
            studentId: invitation.studentId,
            status: "VERIFIED",
            verifiedAt: new Date(),
          },
        });

    return { beneficiaryCategory: "PARENT" as const, relationship };
  });
}
