import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma, rawPrisma } from "../../lib/prisma.js";
import { runWithContext } from "../../lib/tenant-context.js";
import { testAdminPrisma } from "../admin-client.js";
import { createStudent, createTenant } from "../fixtures.js";

describe("tenant isolation (Prisma guard + Postgres RLS)", () => {
  let tenantAId: string;
  let tenantBId: string;
  let studentAId: string;
  let studentBId: string;

  beforeAll(async () => {
    const { tenant: tenantA } = await createTenant("Isolation-A");
    const { tenant: tenantB } = await createTenant("Isolation-B");
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    studentAId = (await createStudent(tenantAId, "ISO-A")).id;
    studentBId = (await createStudent(tenantBId, "ISO-B")).id;
  });

  afterAll(async () => {
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  });

  it("throws when a tenant-scoped query runs with no tenant context at all", async () => {
    await expect(prisma.student.findMany()).rejects.toThrow(/Tenant context missing/);
  });

  it("only returns rows belonging to the locked-in tenant on a list query", async () => {
    const students = await runWithContext({ tenantId: tenantAId, userId: null }, () =>
      prisma.student.findMany(),
    );

    expect(students.map((student) => student.id)).toEqual([studentAId]);
  });

  it("returns null instead of another tenant's row on a single-record lookup", async () => {
    const result = await runWithContext({ tenantId: tenantAId, userId: null }, () =>
      prisma.student.findUnique({ where: { id: studentBId } }),
    );

    expect(result).toBeNull();
  });

  it("cannot update another tenant's row even by exact id", async () => {
    await expect(
      runWithContext({ tenantId: tenantAId, userId: null }, () =>
        prisma.student.update({ where: { id: studentBId }, data: { firstName: "Hacked" } }),
      ),
    ).rejects.toThrow();

    const untouched = await testAdminPrisma.student.findUniqueOrThrow({ where: { id: studentBId } });
    expect(untouched.firstName).toBe("Eleve");
  });

  it("rejects a create whose data.tenantId does not match the locked-in tenant", async () => {
    await expect(
      runWithContext({ tenantId: tenantAId, userId: null }, () =>
        prisma.student.create({
          data: { tenantId: tenantBId, matricule: "SNEAKY", firstName: "X", lastName: "Y" },
        }),
      ),
    ).rejects.toThrow(/Cross-tenant write blocked/);
  });

  it("Postgres itself refuses cross-tenant rows even bypassing the application guard", async () => {
    // Talks to Postgres directly as the least-privilege app role, skipping the
    // Prisma extension entirely, to prove RLS is the DB's own decision — not just
    // application code being well-behaved.
    const rows = await rawPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantAId}, true)`;
      return tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Student" WHERE id = ${studentBId}`;
    });

    expect(rows).toHaveLength(0);
  });
});
