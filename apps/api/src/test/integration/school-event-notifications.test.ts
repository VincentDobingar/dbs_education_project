import request from "supertest";
import { afterAll, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { withTenantSession } from "../../lib/prisma.js";
import { runWithContext } from "../../lib/tenant-context.js";
import { notifySchoolEvent } from "../../modules/communication/notification.service.js";
import { testAdminPrisma as db } from "../admin-client.js";
import { createTenant, createUser, createStudent, createVerifiedRelationship } from "../fixtures.js";

const tenants: string[] = [];
afterAll(async () => {
  await db.notification.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.parentStudentRelationship.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.studentUserLink.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.student.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.tenantDomain.deleteMany({ where: { tenantId: { in: tenants } } });
  await db.tenant.deleteMany({ where: { id: { in: tenants } } });
});
it("notifie parents vérifiés et élève lié, exclut les étrangers et conserve la propriété de lecture", async () => {
  const { tenant } = await createTenant("SchoolEvents", { activeSubscription: false });
  tenants.push(tenant.id);
  const [parent, pupil, stranger, revoked] = await Promise.all([
    createUser("event-parent"),
    createUser("event-pupil"),
    createUser("event-stranger"),
    createUser("event-revoked"),
  ]);
  const student = await createStudent(tenant.id);
  await createVerifiedRelationship(parent.id, student.id, tenant.id);
  await createVerifiedRelationship(revoked.id, student.id, tenant.id);
  await db.parentStudentRelationship.updateMany({
    where: { parentUserId: revoked.id, studentId: student.id },
    data: { revokedAt: new Date() },
  });
  await db.studentUserLink.create({ data: { tenantId: tenant.id, studentId: student.id, userId: pupil.id } });
  for (const type of ["grade.published", "homework.added", "attendance.absence", "discipline.incident"]) {
    await runWithContext({ tenantId: tenant.id, userId: null }, () =>
      notifySchoolEvent({ studentId: student.id, type, body: "Événement de test" }),
    );
  }
  const app = createApp();
  for (const user of [parent, pupil]) {
    const response = await request(app)
      .get("/api/v1/communication/notifications")
      .set("Authorization", `Bearer ${signAccessToken({ sub: user.id })}`);
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(4);
    expect((response.body as { body: string }[]).every((n) => n.body.includes(tenant.name))).toBe(true);
  }
  for (const user of [stranger, revoked])
    expect(await db.notification.count({ where: { userId: user.id } })).toBe(0);
  const notification = await db.notification.findFirstOrThrow({ where: { userId: pupil.id } });
  expect(
    (
      await request(app)
        .patch(`/api/v1/communication/notifications/${notification.id}/read`)
        .set("Authorization", `Bearer ${signAccessToken({ sub: parent.id })}`)
    ).status,
  ).toBe(404);
  expect(
    (
      await request(app)
        .patch(`/api/v1/communication/notifications/${notification.id}/read`)
        .set("Authorization", `Bearer ${signAccessToken({ sub: pupil.id })}`)
    ).status,
  ).toBe(200);
  expect((await db.notification.findUniqueOrThrow({ where: { id: notification.id } })).readAt).not.toBeNull();
  await expect(
    runWithContext({ tenantId: tenant.id, userId: null }, () =>
      withTenantSession(tenant.id, async (tx) => {
        await notifySchoolEvent({ studentId: student.id, type: "rolled.back", body: "Annulé" }, tx);
        throw new Error("rollback");
      }),
    ),
  ).rejects.toThrow("rollback");
  expect(await db.notification.count({ where: { tenantId: tenant.id, type: "rolled.back" } })).toBe(0);
});
