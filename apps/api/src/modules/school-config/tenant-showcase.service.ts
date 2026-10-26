import { rawPrisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { UpdateTenantShowcaseInput } from "./tenant-showcase.validation.js";

export interface TenantShowcase {
  publicDescription: string | null;
  showOnHomepage: boolean;
}

const SELECT = { publicDescription: true, showOnHomepage: true } as const;

/** Même accès direct que tenant-logo.service.ts : `Tenant` n'est pas tenant-scoped, l'écriture est bornée par l'id courant. */
export async function getTenantShowcase(): Promise<TenantShowcase> {
  return rawPrisma.tenant.findUniqueOrThrow({ where: { id: requireCurrentTenantId() }, select: SELECT });
}

export async function updateTenantShowcase(input: UpdateTenantShowcaseInput): Promise<TenantShowcase> {
  return rawPrisma.tenant.update({
    where: { id: requireCurrentTenantId() },
    data: { publicDescription: input.publicDescription, showOnHomepage: input.showOnHomepage },
    select: SELECT,
  });
}
