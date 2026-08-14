import type { Request } from "express";

import { getPlatformRoleCodes } from "../../lib/authorization.js";
import { AppError } from "../../lib/errors.js";

export interface PlatformActor {
  actorUserId: string;
  actorRoleCode?: string;
  justification: string;
}

/** §31 : résout l'acteur (utilisateur + rôle plateforme actif) pour la piste d'audit. */
export async function resolveActor(req: Request, justification: string): Promise<PlatformActor> {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
  }
  const roleCodes = await getPlatformRoleCodes(req.user.id);
  return {
    actorUserId: req.user.id,
    ...(roleCodes[0] ? { actorRoleCode: roleCodes[0] } : {}),
    justification,
  };
}
