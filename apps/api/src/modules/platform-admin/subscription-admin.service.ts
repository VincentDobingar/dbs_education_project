import type { Subscription } from "@prisma/client";

import { recordAuditLog } from "../../lib/audit-log.js";
import { AppError } from "../../lib/errors.js";
import { rawPrisma } from "../../lib/prisma.js";
import { transitionSubscription } from "../subscriptions/subscription.service.js";

import type { PlatformActor } from "./platform-actor.js";
import type {
  ExtendTrialInput,
  ListPlatformSubscriptionsQuery,
  TransitionSubscriptionInput,
} from "./subscription-admin.validation.js";

const OWNER_INCLUDE = { owner: { include: { tenant: true, student: true, organization: true } } } as const;

/**
 * Lecture cross-tenant légitime (§31), même précédent que tenant-admin.service.ts.
 * FamilyAccount n'a pas de champ affichable (juste primaryUserId) — son id brut
 * suffit pour cette tranche, pas de résolution de nom.
 */
export async function listPlatformSubscriptions(query: ListPlatformSubscriptionsQuery) {
  return rawPrisma.subscription.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.ownerType ? { owner: { ownerType: query.ownerType } } : {}),
    },
    include: { plan: true, ...OWNER_INCLUDE },
    orderBy: { createdAt: "desc" },
  });
}

export async function requirePlatformSubscription(id: string) {
  const subscription = await rawPrisma.subscription.findUnique({
    where: { id },
    include: { plan: true, ...OWNER_INCLUDE, events: { orderBy: { createdAt: "desc" } } },
  });
  if (!subscription) {
    throw new AppError(404, "SUBSCRIPTION_NOT_FOUND", `Subscription not found: ${id}`);
  }
  return subscription;
}

/**
 * Réutilise transitionSubscription tel quel (déjà générique : id brut, table de
 * transitions validée, SubscriptionEvent écrit). recordAuditLog est une piste
 * complémentaire, pas redondante : SubscriptionEvent est l'historique du cycle de
 * vie de l'abonnement, AuditLog la piste d'intervention administrative (§31).
 */
export async function forceTransition(
  id: string,
  input: TransitionSubscriptionInput,
  actor: PlatformActor,
): Promise<Subscription> {
  const before = await rawPrisma.subscription.findUnique({ where: { id } });
  if (!before) {
    throw new AppError(404, "SUBSCRIPTION_NOT_FOUND", `Subscription not found: ${id}`);
  }

  const updated = await transitionSubscription(id, input.toStatus, {
    reason: input.justification,
    actorUserId: actor.actorUserId,
  });

  await recordAuditLog({
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action: "subscription.transition",
    entityType: "Subscription",
    entityId: id,
    beforeData: { status: before.status },
    afterData: { status: updated.status },
    justification: input.justification,
  });

  return updated;
}

/** §31 : « essais » — trialEndsAt n'est piloté nulle part ailleurs dans le code actuel. */
export async function extendTrial(
  id: string,
  input: ExtendTrialInput,
  actor: PlatformActor,
): Promise<Subscription> {
  const subscription = await rawPrisma.subscription.findUnique({ where: { id } });
  if (!subscription) {
    throw new AppError(404, "SUBSCRIPTION_NOT_FOUND", `Subscription not found: ${id}`);
  }
  if (subscription.status !== "TRIAL") {
    throw new AppError(
      409,
      "SUBSCRIPTION_NOT_IN_TRIAL",
      "Only a subscription in TRIAL can have its trial extended",
    );
  }

  const updated = await rawPrisma.subscription.update({
    where: { id },
    data: { trialEndsAt: input.trialEndsAt },
  });

  await recordAuditLog({
    actorUserId: actor.actorUserId,
    ...(actor.actorRoleCode ? { actorRoleCode: actor.actorRoleCode } : {}),
    action: "subscription.extend_trial",
    entityType: "Subscription",
    entityId: id,
    beforeData: { trialEndsAt: subscription.trialEndsAt },
    afterData: { trialEndsAt: updated.trialEndsAt },
    justification: input.justification,
  });

  return updated;
}
