import type { Prisma, PlatformSetting } from "@prisma/client";

import { recordAuditLog } from "../../lib/audit-log.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

import type { PlatformActor } from "./platform-actor.js";
import type { UpsertPlatformSettingInput } from "./platform-setting-admin.validation.js";

/**
 * PlatformSetting n'a pas de tenantId (portee plateforme, jamais scopee) — le
 * client garde `prisma` se comporte comme rawPrisma ici, comme MessageTemplate.
 * `key` porte sa propre contrainte unique (pas de piege NULL possible en
 * l'absence de colonne tenantId) : un simple upsert par cle suffit, pas besoin
 * du `findFirst` manuel des tranches precedentes.
 */
async function auditPlatformSetting(
  actor: PlatformActor,
  action: string,
  setting: PlatformSetting,
  beforeData: Prisma.InputJsonValue | undefined,
  afterData: Prisma.InputJsonValue,
): Promise<void> {
  await recordAuditLog({
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action,
    entityType: "PlatformSetting",
    entityId: setting.id,
    ...(beforeData !== undefined ? { beforeData } : {}),
    afterData,
    ...(actor.justification ? { justification: actor.justification } : {}),
  });
}

export async function listPlatformSettings(): Promise<PlatformSetting[]> {
  return prisma.platformSetting.findMany({ orderBy: { key: "asc" } });
}

export async function requirePlatformSetting(key: string): Promise<PlatformSetting> {
  const setting = await prisma.platformSetting.findUnique({ where: { key } });
  if (!setting) {
    throw new AppError(404, "PLATFORM_SETTING_NOT_FOUND", `Platform setting not found: ${key}`);
  }
  return setting;
}

export async function upsertPlatformSetting(
  key: string,
  input: UpsertPlatformSettingInput,
  actor: PlatformActor,
): Promise<PlatformSetting> {
  const before = await prisma.platformSetting.findUnique({ where: { key } });
  const value = input.value as Prisma.InputJsonValue;

  const setting = await prisma.platformSetting.upsert({
    where: { key },
    create: { key, value, updatedById: actor.actorUserId },
    update: { value, updatedById: actor.actorUserId },
  });

  await auditPlatformSetting(
    actor,
    before ? "platform_setting.update" : "platform_setting.create",
    setting,
    before ? { key: before.key, value: before.value } : undefined,
    { key: setting.key, value: setting.value as Prisma.InputJsonValue },
  );
  return setting;
}

export async function deletePlatformSetting(key: string, actor: PlatformActor): Promise<void> {
  const setting = await requirePlatformSetting(key);

  await auditPlatformSetting(
    actor,
    "platform_setting.delete",
    setting,
    { value: setting.value },
    {
      deleted: true,
    },
  );
  await prisma.platformSetting.delete({ where: { key } });
}
