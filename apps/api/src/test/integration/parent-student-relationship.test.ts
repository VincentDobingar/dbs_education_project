import express, { type Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppError } from "../../lib/errors.js";
import { signAccessToken } from "../../lib/jwt.js";
import { getCurrentTenantId } from "../../lib/tenant-context.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireVerifiedStudentRelationship } from "../../middleware/requireVerifiedStudentRelationship.js";
import { testAdminPrisma } from "../admin-client.js";
import {
  createStudent,
  createSubscription,
  createTenant,
  createUser,
  createVerifiedRelationship,
} from "../fixtures.js";
import type { TestResponseBody } from "../test-app.js";

function buildParentApp(): Express {
  const app = express();
  app.get("/children/:studentId", requireAuth, requireVerifiedStudentRelationship(), (_req, res) => {
    res.status(200).json({ ok: true, tenantId: getCurrentTenantId() });
  });
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json({ code: err.code });
      return;
    }
    res.status(500).json({ code: "INTERNAL_ERROR" });
  });
  return app;
}

describe("requireVerifiedStudentRelationship (parent portal)", () => {
  const app = buildParentApp();

  let tenantAId: string;
  let tenantBId: string;
  let parentToken: string;
  let parentUserId: string;
  let unrelatedStudentId: string;

  beforeAll(async () => {
    tenantAId = (await createTenant("Parent-A")).tenant.id;
    tenantBId = (await createTenant("Parent-B")).tenant.id;

    const parent = await createUser("parent");
    parentUserId = parent.id;
    parentToken = signAccessToken({ sub: parent.id });

    unrelatedStudentId = (await createStudent(tenantAId, "UNRELATED")).id;
  });

  afterAll(async () => {
    await testAdminPrisma.parentStudentRelationship.deleteMany({ where: { parentUserId } });
    await testAdminPrisma.subscription.deleteMany({
      where: { owner: { student: { tenantId: { in: [tenantAId, tenantBId] } } } },
    });
    await testAdminPrisma.subscriptionOwner.deleteMany({
      where: { student: { tenantId: { in: [tenantAId, tenantBId] } } },
    });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
  });

  it("blocks access to a student with no relationship at all", async () => {
    const response = await request(app)
      .get(`/children/${unrelatedStudentId}`)
      .set("Authorization", `Bearer ${parentToken}`);

    expect(response.status).toBe(403);
    expect((response.body as TestResponseBody).code).toBe("STUDENT_RELATIONSHIP_NOT_VERIFIED");
  });

  it("blocks access while the relationship is only PENDING (not yet verified)", async () => {
    const student = await createStudent(tenantAId, "PENDING");
    await testAdminPrisma.parentStudentRelationship.create({
      data: { parentUserId, studentId: student.id, tenantId: tenantAId, status: "PENDING" },
    });

    const response = await request(app)
      .get(`/children/${student.id}`)
      .set("Authorization", `Bearer ${parentToken}`);

    expect(response.status).toBe(403);
  });

  it("payment alone does not grant access to an unlinked student", async () => {
    const student = await createStudent(tenantAId, "PAIDNOLINK");
    // The parent has an active individual subscription, but crucially NO relationship record.
    await createSubscription({ studentId: student.id }, "STUDENT", "STUDENT_BASIC", "ACTIVE");

    const response = await request(app)
      .get(`/children/${student.id}`)
      .set("Authorization", `Bearer ${parentToken}`);

    expect(response.status).toBe(403);
    expect((response.body as TestResponseBody).code).toBe("STUDENT_RELATIONSHIP_NOT_VERIFIED");
  });

  it("allows access to a verified child and locks the tenant context to THAT child's tenant", async () => {
    const student = await createStudent(tenantAId, "VERIFIED");
    await createVerifiedRelationship(parentUserId, student.id, tenantAId);

    const response = await request(app)
      .get(`/children/${student.id}`)
      .set("Authorization", `Bearer ${parentToken}`);

    expect(response.status).toBe(200);
    expect((response.body as TestResponseBody).tenantId).toBe(tenantAId);
  });

  it("lets a parent access verified children across two different tenants without leaking other data", async () => {
    const studentInA = await createStudent(tenantAId, "MULTI-A");
    const studentInB = await createStudent(tenantBId, "MULTI-B");
    await createVerifiedRelationship(parentUserId, studentInA.id, tenantAId);
    await createVerifiedRelationship(parentUserId, studentInB.id, tenantBId);

    const responseA = await request(app)
      .get(`/children/${studentInA.id}`)
      .set("Authorization", `Bearer ${parentToken}`);
    const responseB = await request(app)
      .get(`/children/${studentInB.id}`)
      .set("Authorization", `Bearer ${parentToken}`);

    expect(responseA.status).toBe(200);
    expect((responseA.body as TestResponseBody).tenantId).toBe(tenantAId);
    expect(responseB.status).toBe(200);
    expect((responseB.body as TestResponseBody).tenantId).toBe(tenantBId);

    // Even though tenant A was just "unlocked" for this parent, the unrelated
    // sibling student in the same tenant must remain inaccessible.
    const leakAttempt = await request(app)
      .get(`/children/${unrelatedStudentId}`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(leakAttempt.status).toBe(403);
  });

  it("blocks immediately once a previously verified relationship is revoked", async () => {
    const student = await createStudent(tenantAId, "REVOKED");
    const relationship = await createVerifiedRelationship(parentUserId, student.id, tenantAId);

    const before = await request(app)
      .get(`/children/${student.id}`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(before.status).toBe(200);

    await testAdminPrisma.parentStudentRelationship.update({
      where: { id: relationship.id },
      data: { status: "REVOKED", revokedAt: new Date(), revokedReason: "Test revocation" },
    });

    const after = await request(app)
      .get(`/children/${student.id}`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(after.status).toBe(403);
    expect((after.body as TestResponseBody).code).toBe("STUDENT_RELATIONSHIP_NOT_VERIFIED");
  });
});
