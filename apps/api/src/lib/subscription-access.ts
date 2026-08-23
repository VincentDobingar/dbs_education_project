import type { Subscription } from "@prisma/client";
import type { Request } from "express";

import { prisma } from "./prisma.js";

const ACTIVE_SUBSCRIPTION_STATUSES = ["ACTIVE", "TRIAL", "GRACE_PERIOD"] as const;

export interface SubscriptionOwnerContext {
  tenantId?: string;
  familyAccountId?: string;
  studentId?: string;
  organizationId?: string;
}

/** Default resolver for the common case: the tenant already locked in by enforceTenantScope. */
export function tenantOwnerContext(req: Request): SubscriptionOwnerContext | null {
  return req.tenant ? { tenantId: req.tenant.id } : null;
}

/** §26 : l'élève lié, résolu par `:studentId` — même identifiant que
 * `requireLinkedStudent`/`requireVerifiedStudentRelationship` utilisent déjà. */
export function studentOwnerContext(req: Request): SubscriptionOwnerContext | null {
  const studentId = req.params.studentId;
  return typeof studentId === "string" ? { studentId } : null;
}

/**
 * §9 : le parent peut ne pas encore avoir de `FamilyAccount` (abonnement en
 * libre-service, jamais automatique) — un sentinel qui ne correspond à aucun
 * `SubscriptionOwner` réel fait retomber sur « pas d'abonnement actif » (402), jamais
 * un abonnement fabriqué ni le 403 générique de "requête mal formée" que renverrait
 * un contexte `null`.
 */
const NO_FAMILY_ACCOUNT_SENTINEL = "no-family-account";

export async function familyAccountOwnerContext(req: Request): Promise<SubscriptionOwnerContext | null> {
  if (!req.user) {
    return null;
  }
  const familyAccount = await prisma.familyAccount.findFirst({
    where: { primaryUserId: req.user.id, deletedAt: null },
    select: { id: true },
  });
  return { familyAccountId: familyAccount?.id ?? NO_FAMILY_ACCOUNT_SENTINEL };
}

/**
 * §37 : « une licence sponsorisée expirée bloque les fonctionnalités ». `SponsoredLicense`
 * porte `validUntil`/`status` depuis le début (§31 tranche 7) mais rien ne les
 * consultait jusqu'ici — `revokeLicense` (license-admin.service.ts) marquait la
 * licence `REVOKED` sans jamais toucher l'abonnement bénéficiaire, qui restait actif
 * indéfiniment. Vérifié ici, au point d'entrée unique de toute vérification
 * d'abonnement, plutôt que dupliqué dans chaque appelant.
 *
 * Gouverné par la présence réelle d'un `LicenseAssignment`, jamais par
 * `Subscription.fundingSource` : `license-admin.service.ts` ne modifie
 * délibérément jamais ce champ sur un abonnement existant (il se contente de
 * tracer quelle licence couvre quel abonnement déjà créé) — un abonnement
 * réellement couvert par une licence sponsorisée reste donc `SELF_PAID` en
 * pratique. Se fier au funding source ferait passer ce contrôle en code mort :
 * il ne se déclencherait jamais pour un vrai bénéficiaire.
 */
async function licenseAssignmentStatus(subscriptionId: string): Promise<"none" | "valid" | "blocked"> {
  const assignments = await prisma.licenseAssignment.findMany({
    where: { subscriptionId },
    include: { license: true },
  });

  if (assignments.length === 0) {
    return "none";
  }

  const now = new Date();
  const hasValid = assignments.some(
    (assignment) =>
      !assignment.revokedAt &&
      assignment.license.status !== "REVOKED" &&
      (!assignment.license.validUntil || assignment.license.validUntil >= now),
  );

  return hasValid ? "valid" : "blocked";
}

export async function findActiveSubscription(
  context: SubscriptionOwnerContext,
): Promise<Subscription | null> {
  const owner = await prisma.subscriptionOwner.findFirst({ where: context });

  if (!owner) {
    return null;
  }

  const subscription = await prisma.subscription.findFirst({
    where: { ownerId: owner.id, status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] } },
    orderBy: { createdAt: "desc" },
  });

  if (!subscription) {
    return null;
  }

  if ((await licenseAssignmentStatus(subscription.id)) === "blocked") {
    return null;
  }

  return subscription;
}
