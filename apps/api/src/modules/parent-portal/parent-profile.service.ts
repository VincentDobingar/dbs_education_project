import { createHmac, randomInt, randomUUID } from "node:crypto";

import type { ActivationInvitation, Guardian, Prisma, User } from "@prisma/client";
import { z } from "zod";

import { env } from "../../env.js";
import { getEmailProviderAdapter } from "../../lib/email-provider/registry.js";
import { AppError } from "../../lib/errors.js";
import { verifyPassword } from "../../lib/password.js";
import { prisma, rawPrisma, withTenantSession } from "../../lib/prisma.js";
import { getSmsProviderAdapter } from "../../lib/sms-provider/registry.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

export const parentProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    address: z.string().trim().max(500).nullable(),
  })
  .strict();
export const contactChangeSchema = z.discriminatedUnion("channel", [
  z
    .object({
      channel: z.literal("EMAIL"),
      value: z
        .string()
        .trim()
        .email()
        .transform((s) => s.toLowerCase()),
      password: z.string().min(1),
    })
    .strict(),
  z
    .object({
      channel: z.literal("PHONE"),
      value: z.string().regex(/^\+[1-9]\d{7,14}$/),
      password: z.string().min(1),
    })
    .strict(),
]);

async function ensureProfile(tx: Prisma.TransactionClient, userId: string): Promise<Guardian> {
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } });
  const guardian = await tx.guardian.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      firstName: user.profile?.firstName ?? "",
      lastName: user.profile?.lastName ?? "",
      email: user.email,
      phone: user.phone,
    },
  });
  if (guardian.deletedAt) throw new AppError(403, "PARENT_PROFILE_DISABLED", "Profil parent désactivé");
  return guardian;
}

export async function getParentProfile(userId: string) {
  const profile = await rawPrisma.$transaction((tx) => ensureProfile(tx, userId));
  const links = await rawPrisma.parentStudentRelationship.findMany({
    where: { parentUserId: userId, status: "VERIFIED", revokedAt: null },
    select: { tenantId: true, studentId: true },
  });
  const linkedTenantIds: string[] = [];
  for (const tenantId of [...new Set(links.map((link) => link.tenantId))]) {
    const linked = await withTenantSession(tenantId, (tx) =>
      tx.student.findFirst({
        where: {
          tenantId,
          id: { in: links.filter((link) => link.tenantId === tenantId).map((link) => link.studentId) },
          deletedAt: null,
          primaryGuardian: { centralGuardianId: profile.id },
        },
        select: { id: true },
      }),
    );
    if (linked) linkedTenantIds.push(tenantId);
  }
  const schools = await rawPrisma.tenant.findMany({
    where: { id: { in: linkedTenantIds }, deletedAt: null },
    select: { id: true, name: true },
  });
  return { ...profile, schools };
}

/** Une transaction globale, puis contexte RLS de CHAQUE établissement autorisé.
 * Les identifiants proviennent exclusivement des liens vérifiés du parent. */
async function synchronize(tx: Prisma.TransactionClient, guardian: Guardian): Promise<void> {
  const links = await tx.parentStudentRelationship.findMany({
    where: { parentUserId: guardian.userId!, status: "VERIFIED", revokedAt: null },
    select: { tenantId: true, studentId: true },
  });
  for (const tenantId of [...new Set(links.map((link) => link.tenantId))].sort()) {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    const students = await tx.student.findMany({
      where: {
        tenantId,
        id: { in: links.filter((link) => link.tenantId === tenantId).map((link) => link.studentId) },
        deletedAt: null,
      },
      select: { primaryGuardianId: true },
    });
    await tx.schoolGuardian.updateMany({
      where: {
        tenantId,
        centralGuardianId: guardian.id,
        id: {
          in: students.flatMap((student) => (student.primaryGuardianId ? [student.primaryGuardianId] : [])),
        },
      },
      data: {
        firstName: guardian.firstName,
        lastName: guardian.lastName,
        email: guardian.email,
        ...(guardian.phone !== null ? { phone: guardian.phone } : {}),
        address: guardian.address,
        photoUrl: guardian.photoUrl,
      },
    });
  }
}

async function updateProfileInTx(
  tx: Prisma.TransactionClient,
  userId: string,
  data: Prisma.GuardianUpdateInput,
): Promise<Guardian> {
  const existing = await ensureProfile(tx, userId);
  await tx.$queryRaw`SELECT id FROM "Guardian" WHERE id = ${existing.id} FOR UPDATE`;
  const guardian = await tx.guardian.update({ where: { id: existing.id }, data });
  await tx.userProfile.update({
    where: { userId },
    data: { firstName: guardian.firstName, lastName: guardian.lastName },
  });
  await synchronize(tx, guardian);
  await tx.auditLog.create({
    data: {
      actorUserId: userId,
      action: "parent_profile.update",
      entityType: "Guardian",
      entityId: guardian.id,
      afterData: { synchronized: true },
    },
  });
  return guardian;
}

export async function updateParentProfile(userId: string, input: z.infer<typeof parentProfileSchema>) {
  return rawPrisma.$transaction((tx) => updateProfileInTx(tx, userId, input), { timeout: 15000 });
}

/** Appelé UNIQUEMENT après consommation atomique d'une invitation nominative. */
export async function linkPrincipalProfile(
  tx: Prisma.TransactionClient,
  invitation: ActivationInvitation,
  user: User,
): Promise<void> {
  if (!invitation.schoolGuardianId) return;
  await tx.$queryRaw`SELECT id FROM "Student" WHERE id = ${invitation.studentId} AND "tenantId" = ${invitation.tenantId} FOR SHARE`;
  const student = await tx.student.findUnique({ where: { id: invitation.studentId } });
  const local = await tx.schoolGuardian.findUnique({ where: { id: invitation.schoolGuardianId } });
  if (!local || student?.primaryGuardianId !== local.id || local.tenantId !== invitation.tenantId) {
    throw new AppError(
      409,
      "PRINCIPAL_GUARDIAN_CHANGED",
      "Le tuteur principal a changé. Demandez une nouvelle invitation.",
    );
  }
  const verified = invitation.invitedEmail ? Boolean(user.emailVerifiedAt) : Boolean(user.phoneVerifiedAt);
  if (!verified)
    throw new AppError(
      403,
      "VERIFIED_CONTACT_REQUIRED",
      "Vérifiez votre email ou téléphone avant le rattachement",
    );
  const guardian = await tx.guardian.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      userId: user.id,
      firstName: local.firstName,
      lastName: local.lastName,
      phone: user.phone ?? local.phone,
      email: user.email,
      address: local.address,
      photoUrl: local.photoUrl,
    },
  });
  await tx.$queryRaw`SELECT id FROM "Guardian" WHERE id = ${guardian.id} FOR UPDATE`;
  let currentGuardian = await tx.guardian.findUniqueOrThrow({ where: { id: guardian.id } });
  if (currentGuardian.phone === null) {
    currentGuardian = await tx.guardian.update({ where: { id: guardian.id }, data: { phone: local.phone } });
  }
  if (local.centralGuardianId && local.centralGuardianId !== guardian.id)
    throw new AppError(
      409,
      "GUARDIAN_ALREADY_CLAIMED",
      "Ce dossier est déjà rattaché à un autre compte parent",
    );
  const claim = await tx.schoolGuardian.updateMany({
    where: {
      id: local.id,
      tenantId: invitation.tenantId,
      ...(invitation.invitedEmail
        ? { email: { equals: invitation.invitedEmail, mode: "insensitive" } }
        : { phone: invitation.invitedPhone ?? "" }),
      OR: [{ centralGuardianId: null }, { centralGuardianId: currentGuardian.id }],
    },
    data: {
      centralGuardianId: currentGuardian.id,
      firstName: currentGuardian.firstName,
      lastName: currentGuardian.lastName,
      email: currentGuardian.email,
      phone: currentGuardian.phone ?? local.phone,
      address: currentGuardian.address,
      photoUrl: currentGuardian.photoUrl,
    },
  });
  if (claim.count !== 1)
    throw new AppError(
      409,
      "GUARDIAN_CLAIM_CHANGED",
      "Ce dossier a changé ou est déjà rattaché. Demandez une nouvelle invitation.",
    );
}

function hashCode(userId: string, id: string, code: string): string {
  return createHmac("sha256", env.JWT_ACCESS_SECRET).update(`${userId}:${id}:${code}`).digest("hex");
}

export async function requestContactChange(userId: string, input: z.infer<typeof contactChangeSchema>) {
  const user = await rawPrisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, input.password)))
    throw new AppError(401, "INVALID_CREDENTIALS", "Mot de passe incorrect");
  const email = getEmailProviderAdapter();
  const sms = getSmsProviderAdapter();
  if (input.channel === "EMAIL" ? !email : !sms)
    throw new AppError(503, "CONTACT_DELIVERY_UNAVAILABLE", "Le canal de vérification n'est pas configuré");
  const id = randomUUID();
  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await rawPrisma.parentContactChange.create({
    data: {
      id,
      userId,
      channel: input.channel,
      value: input.value,
      expiresAt,
      codeHash: hashCode(userId, id, code),
    },
  });
  try {
    if (input.channel === "EMAIL")
      await email!.send({
        to: input.value,
        subject: "Vérification du profil parent",
        text: `Votre code : ${code}. Valable 10 minutes.`,
      });
    else
      await sms!.send({ to: input.value, body: `Votre code de vérification : ${code}. Valable 10 minutes.` });
  } catch {
    await rawPrisma.parentContactChange.delete({ where: { id } });
    throw new AppError(503, "CONTACT_DELIVERY_FAILED", "Impossible d'envoyer le code. Réessayez.");
  }
  return { id, expiresAt };
}

export async function confirmContactChange(userId: string, id: string, code: string) {
  // Une mauvaise tentative doit être COMMITÉE avant de renvoyer l'erreur.
  const result = await rawPrisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ParentContactChange" WHERE id = ${id} AND "userId" = ${userId} FOR UPDATE`;
      const change = await tx.parentContactChange.findFirst({
        where: { id, userId, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
      });
      if (!change) return null;
      if (change.codeHash !== hashCode(userId, id, code)) {
        await tx.parentContactChange.update({ where: { id }, data: { attempts: { increment: 1 } } });
        return null;
      }
      await tx.parentContactChange.update({ where: { id }, data: { consumedAt: new Date() } });
      await tx.user.update({
        where: { id: userId },
        data:
          change.channel === "EMAIL"
            ? { email: change.value, emailVerifiedAt: new Date() }
            : { phone: change.value, phoneVerifiedAt: new Date() },
      });
      return updateProfileInTx(
        tx,
        userId,
        change.channel === "EMAIL" ? { email: change.value } : { phone: change.value },
      );
    },
    { timeout: 15000 },
  );
  if (!result) throw new AppError(400, "CONTACT_CODE_INVALID", "Code invalide, expiré ou déjà utilisé");
  return result;
}

export type SchoolParentProfileInput = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string | null;
  address?: string | null;
  photoUrl?: string;
};
/** Entry point guarded by students.write. The source record is tenant-scoped;
 * the central lock is shared with parent self-service to serialize updates. */
export async function updateParentFromSchool(
  id: string,
  input: SchoolParentProfileInput,
  actorUserId: string,
) {
  const sourceTenantId = requireCurrentTenantId();
  const local = await prisma.schoolGuardian.findUnique({ where: { id } });
  if (!local) throw new AppError(404, "GUARDIAN_NOT_FOUND", "Tuteur introuvable");
  if (!local.centralGuardianId) return prisma.schoolGuardian.update({ where: { id }, data: input });
  const centralId = local.centralGuardianId;
  return rawPrisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Guardian" WHERE id = ${centralId} FOR UPDATE`;
      const central = await tx.guardian.findUnique({ where: { id: centralId } });
      if (!central?.userId || central.deletedAt)
        throw new AppError(
          409,
          "CENTRAL_PARENT_LINK_REQUIRED",
          "Ce profil central ne possède pas de compte parent actif.",
        );
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${sourceTenantId}, true)`;
      const current = await tx.schoolGuardian.findUnique({ where: { id } });
      if (current?.centralGuardianId !== centralId)
        throw new AppError(
          409,
          "PARENT_PROFILE_CHANGED",
          "Le rattachement du parent a changé. Rechargez le dossier.",
        );
      const verified = await tx.parentStudentRelationship.findFirst({
        where: {
          tenantId: sourceTenantId,
          parentUserId: central.userId,
          status: "VERIFIED",
          revokedAt: null,
          student: { primaryGuardianId: id, deletedAt: null, status: { in: ["ACTIVE", "PROSPECTIVE"] } },
        },
      });
      if (!verified)
        throw new AppError(
          403,
          "CENTRAL_PARENT_LINK_REQUIRED",
          "Un lien parent-enfant vérifié actif est requis pour modifier ce profil central.",
        );
      const guardian = await tx.guardian.update({ where: { id: centralId }, data: input });
      await tx.userProfile.updateMany({
        where: { userId: central.userId },
        data: { firstName: guardian.firstName, lastName: guardian.lastName },
      });
      await synchronize(tx, guardian);
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${sourceTenantId}, true)`;
      await tx.auditLog.create({
        data: {
          tenantId: sourceTenantId,
          actorUserId,
          action: "parent_profile.admin_update",
          entityType: "Guardian",
          entityId: centralId,
          afterData: { synchronized: true },
        },
      });
      return tx.schoolGuardian.findUniqueOrThrow({ where: { id } });
    },
    { timeout: 15000 },
  );
}
