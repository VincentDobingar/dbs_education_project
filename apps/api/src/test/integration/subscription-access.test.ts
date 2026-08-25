import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { requireActiveSubscription } from "../../middleware/requireActiveSubscription.js";
import { requireEntitlement } from "../../middleware/requireEntitlement.js";
import { transitionSubscription } from "../../modules/subscriptions/subscription.service.js";
import { testAdminPrisma } from "../admin-client.js";
import {
  createLicenseAssignment,
  createSponsoredLicense,
  createStudent,
  createSubscription,
  createTenant,
  grantEntitlement,
} from "../fixtures.js";
import { buildTestApp, type TestResponseBody } from "../test-app.js";

function studentOwnerContext(req: { params: { studentId?: string } }) {
  return req.params.studentId ? { studentId: req.params.studentId } : null;
}

describe("requireActiveSubscription / requireEntitlement", () => {
  let tenantId: string;
  const createdStudentIds: string[] = [];
  const createdLicenseIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.licenseAssignment.deleteMany({
      where: { subscription: { owner: { studentId: { in: createdStudentIds } } } },
    });
    await testAdminPrisma.entitlement.deleteMany({
      where: { subscription: { owner: { studentId: { in: createdStudentIds } } } },
    });
    await testAdminPrisma.subscription.deleteMany({
      where: { owner: { studentId: { in: createdStudentIds } } },
    });
    await testAdminPrisma.subscriptionOwner.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await testAdminPrisma.sponsoredLicense.deleteMany({ where: { id: { in: createdLicenseIds } } });
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

    // §37 : « une licence sponsorisée expirée/révoquée bloque les fonctionnalités » —
    // le statut ACTIVE de l'abonnement seul ne suffit plus quand il est financé par
    // une licence sponsorisée (§31).
    it("blocks a sponsored subscription whose license has expired", async () => {
      const studentId = await newStudent();
      const subscription = await createSubscription(
        { studentId },
        "STUDENT",
        "STUDENT_BASIC",
        "ACTIVE",
        "SCHOOL_SPONSORED",
      );
      const license = await createSponsoredLicense("STUDENT_BASIC", {
        validUntil: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
      createdLicenseIds.push(license.id);
      await createLicenseAssignment(license.id, subscription.id, studentId);

      const response = await request(app).get(`/protected/${studentId}`);
      expect(response.status).toBe(402);
      expect((response.body as TestResponseBody).code).toBe("SUBSCRIPTION_INACTIVE");
    });

    it("blocks a sponsored subscription whose license assignment has been revoked", async () => {
      const studentId = await newStudent();
      const subscription = await createSubscription(
        { studentId },
        "STUDENT",
        "STUDENT_BASIC",
        "ACTIVE",
        "SCHOOL_SPONSORED",
      );
      const license = await createSponsoredLicense("STUDENT_BASIC", { validUntil: null });
      createdLicenseIds.push(license.id);
      await createLicenseAssignment(license.id, subscription.id, studentId, new Date());

      const response = await request(app).get(`/protected/${studentId}`);
      expect(response.status).toBe(402);
      expect((response.body as TestResponseBody).code).toBe("SUBSCRIPTION_INACTIVE");
    });

    // §37 : le contrôle doit se déclencher que Subscription.fundingSource ait été
    // mis à jour ou non — license-admin.service.ts (assignLicense) ne le fait
    // jamais délibérément, donc un abonnement réellement couvert par une licence
    // reste SELF_PAID en pratique. Se fier au funding source rendrait ce contrôle
    // inopérant pour tout vrai bénéficiaire.
    it("blocks a SELF_PAID subscription whose license assignment has been revoked, exactly as assignLicense leaves it", async () => {
      const studentId = await newStudent();
      const subscription = await createSubscription({ studentId }, "STUDENT", "STUDENT_BASIC", "ACTIVE");
      expect(subscription.fundingSource).toBe("SELF_PAID");
      const license = await createSponsoredLicense("STUDENT_BASIC", { validUntil: null });
      createdLicenseIds.push(license.id);
      await createLicenseAssignment(license.id, subscription.id, studentId, new Date());

      const response = await request(app).get(`/protected/${studentId}`);
      expect(response.status).toBe(402);
      expect((response.body as TestResponseBody).code).toBe("SUBSCRIPTION_INACTIVE");
    });

    // §6 : le seul point d'entrée (findActiveSubscription) qui rattrape un
    // abonnement dont personne n'a fait avancer le statut manuellement (aucun
    // scheduler dans ce dépôt, docs/architecture.md).
    it("still allows access once a lapsed ACTIVE subscription is lazily advanced into GRACE_PERIOD", async () => {
      const studentId = await newStudent();
      const subscription = await createSubscription({ studentId }, "STUDENT", "STUDENT_BASIC", "ACTIVE");
      await testAdminPrisma.subscription.update({
        where: { id: subscription.id },
        data: { currentPeriodEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      const response = await request(app).get(`/protected/${studentId}`);
      expect(response.status).toBe(200);

      const advanced = await testAdminPrisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(advanced.status).toBe("GRACE_PERIOD");
    });

    it("blocks access once a lapsed GRACE_PERIOD subscription is lazily advanced into EXPIRED", async () => {
      const studentId = await newStudent();
      const subscription = await createSubscription(
        { studentId },
        "STUDENT",
        "STUDENT_BASIC",
        "GRACE_PERIOD",
      );
      await testAdminPrisma.subscription.update({
        where: { id: subscription.id },
        data: { graceEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      const response = await request(app).get(`/protected/${studentId}`);
      expect(response.status).toBe(402);

      const advanced = await testAdminPrisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(advanced.status).toBe("EXPIRED");
    });

    it("allows a sponsored subscription backed by a valid, non-revoked license", async () => {
      const studentId = await newStudent();
      const subscription = await createSubscription(
        { studentId },
        "STUDENT",
        "STUDENT_BASIC",
        "ACTIVE",
        "SCHOOL_SPONSORED",
      );
      const license = await createSponsoredLicense("STUDENT_BASIC", {
        validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      createdLicenseIds.push(license.id);
      await createLicenseAssignment(license.id, subscription.id, studentId);

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

    // §37 : « les quotas sont respectés » — chaque appel consomme réellement le
    // quota, jamais un compteur qui ne bouge pas.
    it("increments quotaUsed on each successful call, then blocks once the limit is reached", async () => {
      const studentId = await newStudent();
      const subscription = await createSubscription({ studentId }, "STUDENT", "STUDENT_BASIC", "ACTIVE");
      const entitlement = await grantEntitlement(subscription.id, "report_card.download", {
        quotaLimit: 1,
        quotaUsed: 0,
      });

      const first = await request(app).get(`/protected/${studentId}`);
      expect(first.status).toBe(200);

      const afterFirstCall = await testAdminPrisma.entitlement.findUniqueOrThrow({
        where: { id: entitlement.id },
      });
      expect(afterFirstCall.quotaUsed).toBe(1);

      const second = await request(app).get(`/protected/${studentId}`);
      expect(second.status).toBe(403);
      expect((second.body as TestResponseBody).code).toBe("QUOTA_EXCEEDED");
    });

    // §6/§37 : « les quotas sont respectés » suppose qu'ils se rechargent à chaque
    // nouvelle période payée — recalculateEntitlements ne remettait jamais quotaUsed
    // à zéro, un quota épuisé restait donc épuisé à vie même après un renouvellement
    // payé (ACTIVE -> SUSPENDED -> ACTIVE ici, même transition qu'un admin
    // réactivant après régularisation).
    it("resets quotaUsed when the subscription re-enters ACTIVE, but not on other transitions", async () => {
      const studentId = await newStudent();
      const subscription = await createSubscription({ studentId }, "STUDENT", "STUDENT_BASIC", "ACTIVE");
      const entitlement = await grantEntitlement(subscription.id, "report_card.download", {
        quotaLimit: 1,
        quotaUsed: 1,
      });

      await transitionSubscription(subscription.id, "SUSPENDED");
      const whileSuspended = await testAdminPrisma.entitlement.findUniqueOrThrow({
        where: { id: entitlement.id },
      });
      expect(whileSuspended.quotaUsed).toBe(1);

      // SUSPENDED n'est pas un statut actif au sens de findActiveSubscription — bloqué
      // en amont du quota (402), jamais un 403 lié à l'entitlement lui-même.
      const stillBlocked = await request(app).get(`/protected/${studentId}`);
      expect(stillBlocked.status).toBe(402);

      await transitionSubscription(subscription.id, "ACTIVE");
      const afterRenewal = await testAdminPrisma.entitlement.findUniqueOrThrow({
        where: { id: entitlement.id },
      });
      expect(afterRenewal.quotaUsed).toBe(0);

      const allowedAgain = await request(app).get(`/protected/${studentId}`);
      expect(allowedAgain.status).toBe(200);
    });
  });
});
