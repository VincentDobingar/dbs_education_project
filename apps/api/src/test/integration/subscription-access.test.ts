import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { requireActiveSubscription } from "../../middleware/requireActiveSubscription.js";
import { requireEntitlement } from "../../middleware/requireEntitlement.js";
import { testAdminPrisma } from "../admin-client.js";
import { createStudent, createSubscription, createTenant, grantEntitlement } from "../fixtures.js";
import { buildTestApp, type TestResponseBody } from "../test-app.js";

function studentOwnerContext(req: { params: { studentId?: string } }) {
  return req.params.studentId ? { studentId: req.params.studentId } : null;
}

describe("requireActiveSubscription / requireEntitlement", () => {
  let tenantId: string;
  const createdStudentIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.entitlement.deleteMany({
      where: { subscription: { owner: { studentId: { in: createdStudentIds } } } },
    });
    await testAdminPrisma.subscription.deleteMany({
      where: { owner: { studentId: { in: createdStudentIds } } },
    });
    await testAdminPrisma.subscriptionOwner.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await testAdminPrisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  async function newStudent(): Promise<string> {
    if (!tenantId) {
      tenantId = (await createTenant("SubAccess")).tenant.id;
    }
    const student = await createStudent(tenantId, "SUB");
    createdStudentIds.push(student.id);
    return student.id;
  }

  describe("requireActiveSubscription", () => {
    const app = buildTestApp(requireActiveSubscription(studentOwnerContext));

    it("blocks when the student has no subscription at all", async () => {
      const studentId = await newStudent();
      const response = await request(app).get(`/protected/${studentId}`);

      expect(response.status).toBe(402);
      expect((response.body as TestResponseBody).code).toBe("SUBSCRIPTION_INACTIVE");
    });

    it("blocks when the subscription has expired, but does not delete the underlying data", async () => {
      const studentId = await newStudent();
      await createSubscription({ studentId }, "STUDENT", "STUDENT_BASIC", "EXPIRED");

      const response = await request(app).get(`/protected/${studentId}`);
      expect(response.status).toBe(402);

      const stillThere = await testAdminPrisma.student.findUniqueOrThrow({ where: { id: studentId } });
      expect(stillThere.id).toBe(studentId);
    });

    it("allows access when the subscription is active", async () => {
      const studentId = await newStudent();
      await createSubscription({ studentId }, "STUDENT", "STUDENT_BASIC", "ACTIVE");

      const response = await request(app).get(`/protected/${studentId}`);
      expect(response.status).toBe(200);
    });
  });

  describe("requireEntitlement", () => {
    const app = buildTestApp(requireEntitlement("report_card.download", studentOwnerContext));

    it("blocks when the active plan does not include the feature", async () => {
      const studentId = await newStudent();
      await createSubscription({ studentId }, "STUDENT", "STUDENT_BASIC", "ACTIVE");

      const response = await request(app).get(`/protected/${studentId}`);
      expect(response.status).toBe(403);
      expect((response.body as TestResponseBody).code).toBe("FEATURE_NOT_INCLUDED");
    });

    it("blocks once the quota is exhausted", async () => {
      const studentId = await newStudent();
      const subscription = await createSubscription({ studentId }, "STUDENT", "STUDENT_BASIC", "ACTIVE");
      await grantEntitlement(subscription.id, "report_card.download", { quotaLimit: 1, quotaUsed: 1 });

      const response = await request(app).get(`/protected/${studentId}`);
      expect(response.status).toBe(403);
      expect((response.body as TestResponseBody).code).toBe("QUOTA_EXCEEDED");
    });

    it("allows access when the feature is included and quota remains", async () => {
      const studentId = await newStudent();
      const subscription = await createSubscription({ studentId }, "STUDENT", "STUDENT_BASIC", "ACTIVE");
      await grantEntitlement(subscription.id, "report_card.download", { quotaLimit: 5, quotaUsed: 2 });

      const response = await request(app).get(`/protected/${studentId}`);
      expect(response.status).toBe(200);
    });
  });
});
