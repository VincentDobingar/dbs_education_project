import type { Request } from "express";

import { getTenantRoleCodes } from "./authorization.js";
import { AppError } from "./errors.js";
import { requireCurrentTenantId } from "./tenant-context.js";

export interface TenantActor {
  actorUserId: string;
  actorRoleCode?: string;
}

/**
 * Finalisation Phase 2 : résout l'acteur (utilisateur + un rôle tenant actif) pour la
 * piste d'audit des actions tenant-internes sensibles (attribution/révocation de rôle,
 * changement de statut de membership, révocation §8/§9, annulation de facture,
 * remboursement). Même forme que PlatformActor (§31) mais sans justification
 * obligatoire : ce n'est pas le type d'intervention que §31 rend explicitement
 * obligatoire de justifier — seule la révocation de relation (déjà un `reason`
 * obligatoire au schéma) alimente `justification` en plus.
 */
export async function resolveTenantActor(req: Request): Promise<TenantActor> {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
  }
  const tenantId = requireCurrentTenantId();
  const roleCodes = await getTenantRoleCodes(req.user.id, tenantId);
  return {
    actorUserId: req.user.id,
    ...(roleCodes[0] ? { actorRoleCode: roleCodes[0] } : {}),
  };
}
