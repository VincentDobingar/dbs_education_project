import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import * as subscriptionService from "../../modules/subscriptions/subscription.service.js";
import { testAdminPrisma } from "../admin-client.js";
import {
  addMembership,
  createStudent,
  createTenant,
  createUser,
  createVerifiedRelationship,
  grantRole,
} from "../fixtures.js";

describe("abonnement individuel de l'élève — libre-service (§26)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.tenantSetting.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.parentStudentRelationship.deleteMany({
      where: { tenantId: { in: createdTenantIds } },
    });
    await testAdminPrisma.receipt.deleteMany({
      where: {
        paymentTransaction: {
          paymentIntent: {
            invoice: { subscription: { owner: { student: { tenantId: { in: createdTenantIds } } } } },
          },
        },
      },
    });
    await testAdminPrisma.paymentTransaction.deleteMany({
      where: {
        paymentIntent: {
          invoice: { subscription: { owner: { student: { tenantId: { in: createdTenantIds } } } } },
        },
      },
    });
    await testAdminPrisma.paymentIntent.deleteMany({
      where: { invoice: { subscription: { owner: { student: { tenantId: { in: createdTenantIds } } } } } },
    });
    await testAdminPrisma.invoiceItem.deleteMany({
      where: { invoice: { subscription: { owner: { student: { tenantId: { in: createdTenantIds } } } } } },
    });
    await testAdminPrisma.invoice.deleteMany({
      where: { subscription: { owner: { student: { tenantId: { in: createdTenantIds } } } } },
    });
    await testAdminPrisma.billingAccount.deleteMany({
      where: { owner: { student: { tenantId: { in: createdTenantIds } } } },
    });
    await testAdminPrisma.entitlement.deleteMany({
      where: { subscription: { owner: { student: { tenantId: { in: createdTenantIds } } } } },
    });
    await testAdminPrisma.subscriptionEvent.deleteMany({
      where: { subscription: { owner: { student: { tenantId: { in: createdTenantIds } } } } },
    });
    await testAdminPrisma.subscription.deleteMany({
      where: { owner: { student: { tenantId: { in: createdTenantIds } } } },
    });
    await testAdminPrisma.subscriptionOwner.deleteMany({
      where: { student: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.studentUserLink.deleteMany({
      where: { student: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.activationCode.deleteMany({
      where: { invitation: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.activationInvitation.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  async function setUpLinkedStudent(overrides: { dateOfBirth?: Date } = {}): Promise<{
    subdomain: string;
    adminToken: string;
    studentToken: string;
    studentId: string;
    tenantId: string;
  }> {
    const { tenant, subdomain } = await createTenant("StudentSubTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("stusub-admin");
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);
    const adminToken = signAccessToken({ sub: admin.id });

    const student = await createStudent(tenant.id, "STUSUB", overrides);
    const studentUser = await createUser("stusub-student");
    const studentToken = signAccessToken({ sub: studentUser.id });

    const invitation = await request(app)
      .post("/api/v1/family/invitations")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId: student.id, beneficiaryCategory: "STUDENT", invitedEmail: studentUser.email });
    const { code } = invitation.body as { code: string };

    const redeemed = await request(app)
      .post("/api/v1/family/activation/redeem")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ code });
    expect(redeemed.status).toBe(200);

    return { subdomain, adminToken, studentToken, studentId: student.id, tenantId: tenant.id };
  }

  it("refuses an unlinked account, then subscribes, invoices, pays in cash, and cancels — never another student's", async () => {
    const { studentToken, studentId } = await setUpLinkedStudent();

    const stranger = await createUser("stusub-stranger");
    const strangerToken = signAccessToken({ sub: stranger.id });

    const deniedStranger = await request(app)
      .post(`/api/v1/subscriptions/student/${studentId}`)
      .set("Authorization", `Bearer ${strangerToken}`)
      .send({ planCode: "STUDENT_BASIC", billingPeriod: "MONTHLY" });
    expect(deniedStranger.status).toBe(403);
    expect((deniedStranger.body as { code: string }).code).toBe("STUDENT_LINK_NOT_VERIFIED");

    const noSubscriptionYet = await request(app)
      .get(`/api/v1/subscriptions/student/${studentId}`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(noSubscriptionYet.status).toBe(404);
    expect((noSubscriptionYet.body as { code: string }).code).toBe("NO_SUBSCRIPTION");

    const subscription = await request(app)
      .post(`/api/v1/subscriptions/student/${studentId}`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ planCode: "STUDENT_BASIC", billingPeriod: "MONTHLY" });
    expect(subscription.status).toBe(201);
    const subscriptionBody = subscription.body as { id: string; status: string };
    expect(subscriptionBody.status).toBe("DRAFT");

    const fetchedSubscription = await request(app)
      .get(`/api/v1/subscriptions/student/${studentId}`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(fetchedSubscription.status).toBe(200);
    expect((fetchedSubscription.body as { id: string }).id).toBe(subscriptionBody.id);

    // Un second élève lié, sans abonnement, ne doit jamais atteindre celui du premier.
    const other = await setUpLinkedStudent();
    const otherNoSubscription = await request(app)
      .get(`/api/v1/subscriptions/student/${other.studentId}`)
      .set("Authorization", `Bearer ${other.studentToken}`);
    expect(otherNoSubscription.status).toBe(404);

    const deniedCrossStudent = await request(app)
      .get(`/api/v1/subscriptions/student/${studentId}`)
      .set("Authorization", `Bearer ${other.studentToken}`);
    expect(deniedCrossStudent.status).toBe(403);
    expect((deniedCrossStudent.body as { code: string }).code).toBe("STUDENT_LINK_NOT_VERIFIED");

    const invoice = await request(app)
      .post(`/api/v1/subscriptions/student/${studentId}/invoice`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ currencyIsoCode: "XAF", billingName: "Test Élève", billingEmail: "eleve@example.test" });
    expect(invoice.status).toBe(201);
    const invoiceId = (invoice.body as { id: string }).id;

    const intent = await request(app)
      .post(`/api/v1/subscriptions/student/${studentId}/payment-intent`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ invoiceId, providerCode: "CASH_AGENT" });
    expect(intent.status).toBe(201);
    const paymentIntentId = (intent.body as { id: string }).id;

    // DRAFT -> ACTIVE exige de passer par PENDING_PAYMENT (subscription-transitions.ts) —
    // aucune route self-service ne l'expose encore, même limite déjà en place côté
    // "school" et "family" (subscription.routes.ts n'a pas non plus cette transition en HTTP).
    await subscriptionService.transitionSubscription(subscriptionBody.id, "PENDING_PAYMENT");

    const cashPayment = await request(app)
      .post(`/api/v1/subscriptions/student/${studentId}/cash-payment`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ paymentIntentId });
    expect(cashPayment.status).toBe(200);

    const activeSubscription = await request(app)
      .get(`/api/v1/subscriptions/student/${studentId}`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect((activeSubscription.body as { status: string }).status).toBe("ACTIVE");

    // §26 : le tableau de bord élève expose désormais cet abonnement.
    const dashboard = await request(app)
      .get(`/api/v1/student-portal/students/${studentId}/dashboard`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect((dashboard.body as { subscription: { id: string } }).subscription.id).toBe(subscriptionBody.id);

    const deniedCancel = await request(app)
      .post(`/api/v1/subscriptions/student/${studentId}/${subscriptionBody.id}/cancel`)
      .set("Authorization", `Bearer ${strangerToken}`)
      .send({ reason: "Test" });
    expect(deniedCancel.status).toBe(403);

    const cancelled = await request(app)
      .post(`/api/v1/subscriptions/student/${studentId}/${subscriptionBody.id}/cancel`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ reason: "Test" });
    expect(cancelled.status).toBe(200);
    expect((cancelled.body as { status: string }).status).toBe("CANCELLED");
  }, 30000);

  it("refuses a plan whose category does not match STUDENT", async () => {
    const { studentToken, studentId } = await setUpLinkedStudent();

    const mismatched = await request(app)
      .post(`/api/v1/subscriptions/student/${studentId}`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ planCode: "PARENT_BASIC", billingPeriod: "MONTHLY" });
    expect(mismatched.status).toBe(422);
    expect((mismatched.body as { code: string }).code).toBe("PLAN_CATEGORY_MISMATCH");
  });

  // §37 : « le front ne peut pas forger son statut/plan » — createStudentSubscriptionSchema
  // n'accepte que planCode/billingPeriod/promoCode, et le contrôleur fixe lui-même
  // status/fundingSource/ownerRef : tout champ privilégié envoyé par le client doit être
  // silencieusement ignoré, jamais reflété dans la ligne créée.
  it("ignores a forged status/planId/fundingSource in the subscription creation body", async () => {
    const { studentToken, studentId } = await setUpLinkedStudent();
    const realPlan = await testAdminPrisma.subscriptionPlan.findUniqueOrThrow({
      where: { code: "STUDENT_BASIC" },
    });
    const otherPlan = await testAdminPrisma.subscriptionPlan.findUniqueOrThrow({
      where: { code: "STUDENT_PREMIUM" },
    });

    const forged = await request(app)
      .post(`/api/v1/subscriptions/student/${studentId}`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        planCode: "STUDENT_BASIC",
        billingPeriod: "MONTHLY",
        status: "ACTIVE",
        planId: otherPlan.id,
        fundingSource: "SCHOOL_SPONSORED",
        ownerId: "forged-owner-id",
        trialEndsAt: "2999-01-01",
      });
    expect(forged.status).toBe(201);
    const forgedBody = forged.body as {
      status: string;
      planId: string;
      fundingSource: string;
      trialEndsAt: string | null;
    };
    expect(forgedBody.status).toBe("DRAFT");
    expect(forgedBody.planId).toBe(realPlan.id);
    expect(forgedBody.fundingSource).toBe("SELF_PAID");
    expect(forgedBody.trialEndsAt).toBeNull();
  });

  function yearsAgo(years: number): Date {
    const date = new Date();
    date.setFullYear(date.getFullYear() - years);
    return date;
  }

  // §16 : « pour les élèves mineurs, prévoir les règles de consentement ... selon
  // les paramètres applicables » — requireMinorConsentForStudentSubscription.
  describe("consentement parental pour un élève mineur (§16)", () => {
    it("refuses a minor student with no verified parent, then succeeds once one exists", async () => {
      const { subdomain, studentToken, studentId } = await setUpLinkedStudent({
        dateOfBirth: yearsAgo(10),
      });

      const denied = await request(app)
        .post(`/api/v1/subscriptions/student/${studentId}`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ planCode: "STUDENT_BASIC", billingPeriod: "MONTHLY" });
      expect(denied.status).toBe(403);
      expect((denied.body as { code: string }).code).toBe("MINOR_CONSENT_REQUIRED");

      const tenant = await testAdminPrisma.tenantDomain.findFirstOrThrow({ where: { subdomain } });
      const parent = await createUser("stusub-minor-parent");
      await createVerifiedRelationship(parent.id, studentId, tenant.tenantId);

      const allowed = await request(app)
        .post(`/api/v1/subscriptions/student/${studentId}`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ planCode: "STUDENT_BASIC", billingPeriod: "MONTHLY" });
      expect(allowed.status).toBe(201);
    });

    it("does not gate an adult student or a student with no dateOfBirth on file", async () => {
      const adult = await setUpLinkedStudent({ dateOfBirth: yearsAgo(25) });
      const adultAllowed = await request(app)
        .post(`/api/v1/subscriptions/student/${adult.studentId}`)
        .set("Authorization", `Bearer ${adult.studentToken}`)
        .send({ planCode: "STUDENT_BASIC", billingPeriod: "MONTHLY" });
      expect(adultAllowed.status).toBe(201);

      const unknownDob = await setUpLinkedStudent();
      const unknownDobAllowed = await request(app)
        .post(`/api/v1/subscriptions/student/${unknownDob.studentId}`)
        .set("Authorization", `Bearer ${unknownDob.studentToken}`)
        .send({ planCode: "STUDENT_BASIC", billingPeriod: "MONTHLY" });
      expect(unknownDobAllowed.status).toBe(201);
    });

    it("does not gate a minor when the tenant has disabled the setting", async () => {
      const { subdomain, adminToken, studentToken, studentId } = await setUpLinkedStudent({
        dateOfBirth: yearsAgo(10),
      });

      const disabled = await request(app)
        .put("/api/v1/school-config/minor-consent-setting")
        .set("Authorization", `Bearer ${adminToken}`)
        .set("X-Tenant-Slug", subdomain)
        .send({ enabled: false, majorityAge: 18 });
      expect(disabled.status).toBe(200);

      const allowed = await request(app)
        .post(`/api/v1/subscriptions/student/${studentId}`)
        .set("Authorization", `Bearer ${studentToken}`)
        .send({ planCode: "STUDENT_BASIC", billingPeriod: "MONTHLY" });
      expect(allowed.status).toBe(201);
    });
  });
});
