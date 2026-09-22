import { rawPrisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { SetTenantLogoInput } from "./tenant-logo.validation.js";

export interface TenantLogo {
  logoUrl: string | null;
}

/**
 * `Tenant` n'est pas un modèle tenant-scoped (§2 : c'est le tenant lui-même, pas
 * une table qui lui appartient) — pas dans `tenant-scoped-models.ts`, donc jamais
 * filtré par l'extension Prisma ni par une politique RLS. Un `rawPrisma.tenant.update`
 * direct, scopé par `id: requireCurrentTenantId()`, est le même schéma que
 * `transitionTenant` (platform-admin/tenant-admin.service.ts) : rien d'autre ne
 * peut jamais élargir la portée d'une écriture sur cette seule ligne.
 */
export async function getTenantLogo(): Promise<TenantLogo> {
  const tenant = await rawPrisma.tenant.findUniqueOrThrow({
    where: { id: requireCurrentTenantId() },
    select: { logoUrl: true },
  });
  return { logoUrl: tenant.logoUrl };
}

export async function setTenantLogo(input: SetTenantLogoInput): Promise<TenantLogo> {
  const tenant = await rawPrisma.tenant.update({
    where: { id: requireCurrentTenantId() },
    data: { logoUrl: input.logoUrl },
    select: { logoUrl: true },
  });
  return { logoUrl: tenant.logoUrl };
}
