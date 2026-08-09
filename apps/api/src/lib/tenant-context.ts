import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  userId: string | null;
  tenantId: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" && value !== null && typeof (value as PromiseLike<unknown>).then === "function"
  );
}

/**
 * Prisma's `.findMany()` etc. return a lazy "PrismaPromise": calling it does not
 * itself dispatch the query, only attaching `.then()` does. If `fn()` returns one
 * of those and the caller awaits the result of runWithContext AFTER this function
 * has already returned, that `.then()` attachment happens outside storage.run()'s
 * dynamic extent and AsyncLocalStorage silently loses the context (a well-known
 * Node ALS + lazy-thenable pitfall). Attaching `.then()` synchronously in here,
 * still inside run()'s callback, keeps the query's continuation correctly attributed
 * to this context no matter how many further awaits happen downstream.
 */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, () => {
    const result = fn();
    return isThenable(result) ? (result.then((value) => value) as T) : result;
  });
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Reads the tenant locked in for the current request. Only enforceTenantScope
 * is allowed to set this value — every other layer must treat it as read-only.
 */
export function getCurrentTenantId(): string | null {
  return getContext()?.tenantId ?? null;
}

/**
 * Same as getCurrentTenantId, but throws instead of returning null. Convenient in
 * services that only ever run behind enforceTenantScope + requireTenantMembership
 * (§17) and need a plain `string` to satisfy a tenant-scoped model's Prisma types —
 * the tenant-guard extension (prisma.ts) still validates/injects it at runtime
 * regardless, this just keeps TypeScript's Unchecked*CreateInput shapes happy.
 */
export function requireCurrentTenantId(): string {
  const tenantId = getCurrentTenantId();
  if (!tenantId) {
    throw new Error("Tenant context missing: this must run behind enforceTenantScope.");
  }
  return tenantId;
}
