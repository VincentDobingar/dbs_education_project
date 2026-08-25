import type { TenantStatus } from "@prisma/client";

/**
 * §14/§31 : statuts qui doivent bloquer tout usage ordinaire du tenant — un
 * établissement rejeté, annulé ou suspendu par la super-administration. Partagé
 * entre enforceTenantScope.ts (accès direct) et transfer.service.ts (résolution
 * d'un établissement destinataire) pour ne pas laisser cette liste diverger une
 * deuxième fois silencieusement (SUSPENDED manquait des deux jusqu'ici : le bouton
 * « suspendre » du super-admin écrivait bien le statut et l'audit, mais rien en
 * aval ne le consultait — le personnel du tenant suspendu continuait d'opérer
 * normalement sur toutes les données).
 */
export const BLOCKED_TENANT_STATUSES: ReadonlySet<TenantStatus> = new Set([
  "REJECTED",
  "CANCELLED",
  "SUSPENDED",
]);

export function isTenantBlocked(status: TenantStatus): boolean {
  return BLOCKED_TENANT_STATUSES.has(status);
}
