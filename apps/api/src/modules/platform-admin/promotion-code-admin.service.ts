import type { Prisma, PromotionCode } from "@prisma/client";

import { recordAuditLog } from "../../lib/audit-log.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";

import type { PlatformActor } from "./platform-actor.js";
import type {
  CreatePromotionCodeInput,
  ListPromotionCodesQuery,
  UpdatePromotionCodeInput,
} from "./promotion-code-admin.validation.js";

/**
 * PromotionCode n'est pas un modèle tenant-scoped (pas de colonne tenantId) — le
 * client gardé `prisma` se comporte comme rawPrisma ici, pas besoin de bootstrap.
 * Comme pour les pays/devises/moyens de paiement (tranche 3), créer/désactiver un
 * code promo n'est pas une intervention *dans* un tenant au sens de §31 : la
 * justification reste optionnelle, recordAuditLog trace quand même chaque écriture.
 */

async function auditPromotionCode(
  actor: PlatformActor,
  action: string,
  entityId: string,
  beforeData: Prisma.InputJsonValue | undefined,
  afterData: Prisma.InputJsonValue,
): Promise<void> {
  await recordAuditLog({
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action,
    entityType: "PromotionCode",
    entityId,
    ...(beforeData !== undefined ? { beforeData } : {}),
    afterData,
    ...(actor.justification ? { justification: actor.justification } : {}),
  });
}

export async function listPromotionCodes(query: ListPromotionCodesQuery): Promise<PromotionCode[]> {
  return prisma.promotionCode.findMany({
    where: {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createPromotionCode(
  input: CreatePromotionCodeInput,
  actor: PlatformActor,
): Promise<PromotionCode> {
  const existing = await prisma.promotionCode.findUnique({ where: { code: input.code } });
  if (existing) {
    throw new AppError(409, "PROMOTION_CODE_TAKEN", `Promotion code already in use: ${input.code}`);
  }

  const promotionCode = await prisma.promotionCode.create({
    data: {
      code: input.code,
      ...(input.descriptionFr !== undefined ? { descriptionFr: input.descriptionFr } : {}),
      ...(input.descriptionEn !== undefined ? { descriptionEn: input.descriptionEn } : {}),
      discountType: input.discountType,
      discountValue: input.discountValue,
      ...(input.applicableCategory !== undefined ? { applicableCategory: input.applicableCategory } : {}),
      ...(input.maxRedemptions !== undefined ? { maxRedemptions: input.maxRedemptions } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
    },
  });

  await auditPromotionCode(actor, "promotion_code.create", promotionCode.id, undefined, {
    code: promotionCode.code,
    discountType: promotionCode.discountType,
  });
  return promotionCode;
}

async function requirePromotionCode(id: string): Promise<PromotionCode> {
  const promotionCode = await prisma.promotionCode.findUnique({ where: { id } });
  if (!promotionCode) {
    throw new AppError(404, "PROMOTION_CODE_NOT_FOUND", `Promotion code not found: ${id}`);
  }
  return promotionCode;
}

export async function updatePromotionCode(
  id: string,
  input: UpdatePromotionCodeInput,
  actor: PlatformActor,
): Promise<PromotionCode> {
  const before = await requirePromotionCode(id);

  const updated = await prisma.promotionCode.update({
    where: { id },
    data: {
      ...(input.descriptionFr !== undefined ? { descriptionFr: input.descriptionFr } : {}),
      ...(input.descriptionEn !== undefined ? { descriptionEn: input.descriptionEn } : {}),
      ...(input.discountType !== undefined ? { discountType: input.discountType } : {}),
      ...(input.discountValue !== undefined ? { discountValue: input.discountValue } : {}),
      ...(input.applicableCategory !== undefined ? { applicableCategory: input.applicableCategory } : {}),
      ...(input.maxRedemptions !== undefined ? { maxRedemptions: input.maxRedemptions } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  await auditPromotionCode(
    actor,
    "promotion_code.update",
    id,
    { isActive: before.isActive },
    { isActive: updated.isActive },
  );
  return updated;
}
