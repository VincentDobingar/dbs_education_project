import { PrismaClient, Prisma } from "@prisma/client";

import { getCurrentTenantId } from "./tenant-context.js";
import { isTenantScopedModel } from "./tenant-scoped-models.js";

const READ_MANY_OPERATIONS = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
]);
const SINGLE_RECORD_READ_OPERATIONS = new Set(["findUnique", "findUniqueOrThrow"]);
const WHERE_SCOPED_WRITE_OPERATIONS = new Set(["update", "updateMany", "delete", "deleteMany"]);

function requireTenantId(model: string): string {
  const tenantId = getCurrentTenantId();

  if (!tenantId) {
    throw new Error(
      `Tenant context missing for a query on "${model}". enforceTenantScope must run before any tenant-scoped data access.`,
    );
  }

  return tenantId;
}

function mergeWhereTenantId(where: unknown, tenantId: string): Record<string, unknown> {
  const existing = (where ?? {}) as Record<string, unknown>;

  if ("tenantId" in existing && existing.tenantId !== tenantId) {
    throw new Error("Cross-tenant query blocked: where.tenantId does not match the resolved tenant context.");
  }

  return { ...existing, tenantId };
}

function withTenantId(data: unknown, tenantId: string): Record<string, unknown> {
  const record = { ...(data as Record<string, unknown>) };

  if ("tenantId" in record && record.tenantId !== tenantId) {
    throw new Error("Cross-tenant write blocked: data.tenantId does not match the resolved tenant context.");
  }

  record.tenantId = tenantId;
  return record;
}

function resultBelongsToTenant(result: unknown, tenantId: string): boolean {
  return (
    result !== null && typeof result === "object" && "tenantId" in result && result.tenantId === tenantId
  );
}

/** "AcademicYear" -> "academicYear" : Prisma Client's model property naming convention. */
function modelAccessor(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/**
 * Unwrapped client, bypassing the tenant guard entirely. Only legitimate uses:
 * 1. enforceTenantScope's own bootstrap lookups (resolving *which* tenant a request
 *    belongs to necessarily happens before any tenant context exists to guard with).
 * 2. The tenant-guard extension's own internal transaction wrapping (below).
 * 3. Explicitly authorized, audited super-admin cross-tenant operations (§31) —
 *    each such call site must write an AuditLog entry with a justification.
 * Never use this to "work around" a guard failure inside ordinary request handling.
 */
export const rawPrisma = new PrismaClient();

/**
 * Two layers of tenant isolation (§2), kept independent on purpose so a bug in one
 * never compromises the other:
 *
 * 1. Application layer (this extension): scopes/validates every where/data payload
 *    against the tenant locked in by enforceTenantScope.
 * 2. Database layer: Postgres Row-Level Security policies (see the
 *    enable_row_level_security migration) refuse rows outside "app.tenant_id" —
 *    enforced here by running each scoped operation inside a short transaction
 *    that sets that session variable first via set_config(..., true) (LOCAL, i.e.
 *    scoped to the transaction only, never leaking to a pooled connection's next use).
 *
 * KNOWN LIMITATION: this wraps each individual Prisma call in its own transaction.
 * A service that needs several scoped writes to be atomically consistent together
 * (e.g. a financial operation debiting one row and crediting another) must NOT rely
 * on this per-call wrapping — it will need a dedicated helper opening one explicit
 * transaction and setting app.tenant_id once for the whole block. That helper does
 * not exist yet; build it when the first such service needs it (Phase 3+), rather
 * than guessing its shape now.
 */
const tenantGuardExtension = Prisma.defineExtension((client) =>
  client.$extends({
    name: "tenant-guard",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!isTenantScopedModel(model)) {
            return query(args);
          }

          const tenantId = requireTenantId(model);
          const typedArgs = args as { where?: unknown; data?: unknown };
          let finalArgs = args;

          if (READ_MANY_OPERATIONS.has(operation) || WHERE_SCOPED_WRITE_OPERATIONS.has(operation)) {
            typedArgs.where = mergeWhereTenantId(typedArgs.where, tenantId);
            finalArgs = typedArgs as typeof args;
          } else if (operation === "create") {
            typedArgs.data = withTenantId(typedArgs.data, tenantId);
            finalArgs = typedArgs as typeof args;
          } else if (operation === "createMany" || operation === "createManyAndReturn") {
            const items = (typedArgs.data as unknown[] | undefined) ?? [];
            typedArgs.data = items.map((item) => withTenantId(item, tenantId));
            finalArgs = typedArgs as typeof args;
          } else if (operation === "upsert") {
            const upsertArgs = args as { where?: unknown; create?: unknown; update?: unknown };
            upsertArgs.where = mergeWhereTenantId(upsertArgs.where, tenantId);
            upsertArgs.create = withTenantId(upsertArgs.create, tenantId);
            finalArgs = upsertArgs as typeof args;
          }

          const accessor = modelAccessor(model);

          const result: unknown = await rawPrisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- dynamic model dispatch, shape verified by isTenantScopedModel
            return (tx as any)[accessor][operation](finalArgs) as Promise<unknown>;
          });

          if (SINGLE_RECORD_READ_OPERATIONS.has(operation)) {
            return resultBelongsToTenant(result, tenantId) ? result : null;
          }

          return result;
        },
      },
    },
  }),
);

export const prisma = rawPrisma.$extends(tenantGuardExtension);
export type PrismaClientWithTenantGuard = typeof prisma;
