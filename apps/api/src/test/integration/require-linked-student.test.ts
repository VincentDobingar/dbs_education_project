import express, { type Express } from "express";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { AppError } from "../../lib/errors.js";
import { signAccessToken } from "../../lib/jwt.js";
import { getCurrentTenantId } from "../../lib/tenant-context.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireLinkedStudent } from "../../middleware/requireLinkedStudent.js";
import { testAdminPrisma } from "../admin-client.js";
import { createStudent, createTenant, createUser } from "../fixtures.js";
import type { TestResponseBody } from "../test-app.js";

function buildStudentApp(): Express {
  const app = express();
  app.get("/students/:studentId", requireAuth, requireLinkedStudent(), (_req, res) => {
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

// §31 : enforceTenantScope bloque déjà un tenant SUSPENDED/REJECTED/CANCELLED côté
// staff, mais requireLinkedStudent est le seul point d'entrée côté portail élève
// (et du pipeline d'abonnement self-service /subscriptions/student/...) et ne
// repasse jamais par lui — un élève lié gardait un accès total à un établissement
// suspendu par la super-administration.
describe("requireLinkedStudent (portail élève) — garde de statut tenant (§31)", () => {
  const app = buildStudentApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.studentUserLink.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  it("blocks access once the linked student's tenant is suspended, and restores it on reactivation", async () => {
    const { tenant } = await createTenant("LinkedStudentSuspend");
    createdTenantIds.push(tenant.id);

    const user = await createUser("linked-student");
    const student = await createStudent(tenant.id, "LINKED");
    await testAdminPrisma.studentUserLink.create({
      data: { tenantId: tenant.id, studentId: student.id, userId: user.id },
    });
    const token = signAccessToken({ sub: user.id });

    const before = await request(app).get(`/students/${student.id}`).set("Authorization", `Bearer ${token}`);
    expect(before.status).toBe(200);
    expect((before.body as TestResponseBody).tenantId).toBe(tenant.id);

    await testAdminPrisma.tenant.update({ where: { id: tenant.id }, data: { status: "SUSPENDED" } });

    const duringSuspension = await request(app)
      .get(`/students/${student.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(duringSuspension.status).toBe(403);
    expect((duringSuspension.body as TestResponseBody).code).toBe("TENANT_UNAVAILABLE");

    await testAdminPrisma.tenant.update({ where: { id: tenant.id }, data: { status: "ACTIVE" } });

    const afterReactivation = await request(app)
      .get(`/students/${student.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(afterReactivation.status).toBe(200);
  });

  // §26/§31 : un transfert/retrait/archivage écrit Student.status/deletedAt mais ne
  // touche jamais StudentUserLink — l'élève gardait un accès total au portail élève
  // de son ancien établissement indéfiniment après son départ.
  it("blocks access once the linked student is transferred, withdrawn or archived", async () => {
    const { tenant } = await createTenant("LinkedStudentDeparture");
    createdTenantIds.push(tenant.id);

    const user = await createUser("linked-student-departure");
    const student = await createStudent(tenant.id, "DEPART");
    await testAdminPrisma.studentUserLink.create({
      data: { tenantId: tenant.id, studentId: student.id, userId: user.id },
    });
    const token = signAccessToken({ sub: user.id });

    const before = await request(app).get(`/students/${student.id}`).set("Authorization", `Bearer ${token}`);
    expect(before.status).toBe(200);

    await testAdminPrisma.student.update({ where: { id: student.id }, data: { status: "TRANSFERRED" } });
    const afterTransfer = await request(app)
      .get(`/students/${student.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(afterTransfer.status).toBe(403);
    expect((afterTransfer.body as TestResponseBody).code).toBe("STUDENT_UNAVAILABLE");

    await testAdminPrisma.student.update({ where: { id: student.id }, data: { status: "WITHDRAWN" } });
    const afterWithdrawal = await request(app)
      .get(`/students/${student.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(afterWithdrawal.status).toBe(403);

    await testAdminPrisma.student.update({
      where: { id: student.id },
      data: { status: "ARCHIVED", deletedAt: new Date() },
    });
    const afterArchive = await request(app)
      .get(`/students/${student.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(afterArchive.status).toBe(403);

    await testAdminPrisma.student.update({
      where: { id: student.id },
      data: { status: "ACTIVE", deletedAt: null },
    });
    const afterRestore = await request(app)
      .get(`/students/${student.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(afterRestore.status).toBe(200);
  });
});
