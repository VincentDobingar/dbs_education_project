import { prisma } from "./prisma.js";

/**
 * Resolves the Employee record of the acting user — never trust a client-supplied
 * employee id for "who did this". `archiveEmployee` (employees/employee.service.ts,
 * §27) sets `deletedAt` and `status: "TERMINATED"` together, but nothing consulted
 * `deletedAt` here until now: a dismissed employee whose TenantMembership/UserRole
 * had not been separately revoked could keep recording payments, grades,
 * attendance... under their former staff identity — same bug class as
 * `Tenant.status = SUSPENDED` never being checked by `enforceTenantScope`
 * (`lib/tenant-status.ts`): a retirement signal the service writes but nothing
 * reads. Filters on `deletedAt` (the soft-delete convention used everywhere else in
 * this codebase) rather than `status`, so an `ON_LEAVE` employee — still legitimate
 * staff, just temporarily away — is unaffected.
 */
export async function resolveActingEmployeeId(userId: string): Promise<string | undefined> {
  const employee = await prisma.employee.findFirst({ where: { userId, deletedAt: null } });
  return employee?.id;
}
