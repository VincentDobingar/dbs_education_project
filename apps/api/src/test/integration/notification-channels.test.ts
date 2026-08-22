import request from "supertest";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../../app.js";
import {
  registerEmailProviderAdapter,
  resetEmailProviderAdapter,
} from "../../lib/email-provider/registry.js";
import type { EmailProviderAdapter, SendEmailInput } from "../../lib/email-provider/types.js";
import { signAccessToken } from "../../lib/jwt.js";
import { registerSmsProviderAdapter, resetSmsProviderAdapter } from "../../lib/sms-provider/registry.js";
import type { SendSmsInput, SmsProviderAdapter } from "../../lib/sms-provider/types.js";
import { testAdminPrisma } from "../admin-client.js";
import {
  addMembership,
  createStudent,
  createTenant,
  createUser,
  grantRole,
  uniqueSuffix,
} from "../fixtures.js";

describe("canaux de notification réels — email/SMS (§28)", () => {
  const app = createApp();
  const createdUserIds: string[] = [];
  const createdTenantIds: string[] = [];

  afterEach(() => {
    resetEmailProviderAdapter();
    resetSmsProviderAdapter();
  });

  afterAll(async () => {
    await testAdminPrisma.disciplinaryIncident.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.parentStudentRelationship.deleteMany({
      where: { tenantId: { in: createdTenantIds } },
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
    await testAdminPrisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  });

  function registerFakeEmail() {
    const send = vi.fn<(input: SendEmailInput) => Promise<void>>().mockResolvedValue(undefined);
    const adapter: EmailProviderAdapter = { code: "FAKE", send };
    registerEmailProviderAdapter(adapter);
    return send;
  }

  function registerFakeSms() {
    const send = vi.fn<(input: SendSmsInput) => Promise<void>>().mockResolvedValue(undefined);
    const adapter: SmsProviderAdapter = { code: "FAKE", send };
    registerSmsProviderAdapter(adapter);
    return send;
  }

  function callTo(send: ReturnType<typeof registerFakeEmail>, to: string): SendEmailInput | undefined {
    return send.mock.calls.map(([input]) => input).find((input) => input.to === to);
  }

  function smsCallTo(send: ReturnType<typeof registerFakeSms>, to: string): SendSmsInput | undefined {
    return send.mock.calls.map(([input]) => input).find((input) => input.to === to);
  }

  it("attempts email + SMS delivery on registration and on resend, without changing the existing response shape", async () => {
    const email = registerFakeEmail();
    const sms = registerFakeSms();

    const testEmail = `chan-${uniqueSuffix()}@example.test`;
    const testPhone = `+237690${uniqueSuffix().slice(0, 6)}`;

    const registered = await request(app).post("/api/v1/auth/register").send({
      email: testEmail,
      password: "Sup3r-Secret-Passw0rd!",
      firstName: "Test",
      lastName: "Chan",
      phone: testPhone,
    });
    expect(registered.status).toBe(201);
    const body = registered.body as {
      id: string;
      emailVerificationToken: string;
      phoneVerificationCode: string;
    };
    createdUserIds.push(body.id);

    expect(callTo(email, testEmail)?.text).toContain(body.emailVerificationToken);
    expect(smsCallTo(sms, testPhone)?.body).toContain(body.phoneVerificationCode);

    const resent = await request(app)
      .post("/api/v1/auth/resend-email-verification")
      .send({ email: testEmail });
    expect(resent.status).toBe(200);
    const newToken = (resent.body as { emailVerificationToken: string }).emailVerificationToken;
    expect(newToken).not.toBe(body.emailVerificationToken);

    const resendCalls = email.mock.calls.map(([input]) => input).filter((input) => input.to === testEmail);
    expect(resendCalls.some((input) => input.text.includes(newToken))).toBe(true);
  }, 30000);

  it("attempts email + SMS delivery for an activation invitation code", async () => {
    const email = registerFakeEmail();
    const sms = registerFakeSms();

    const { tenant, subdomain } = await createTenant("ChannelsTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("chan-admin");
    createdUserIds.push(admin.id);
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);
    const adminToken = signAccessToken({ sub: admin.id });

    const student = await createStudent(tenant.id, "CHAN");

    const invitedEmail = `invitee-${uniqueSuffix()}@example.test`;
    const invitedPhone = `+237699${uniqueSuffix().slice(0, 6)}`;

    const invitation = await request(app)
      .post("/api/v1/family/invitations")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId: student.id, beneficiaryCategory: "PARENT", invitedEmail, invitedPhone });
    expect(invitation.status).toBe(201);
    const { code } = invitation.body as { code: string };

    expect(callTo(email, invitedEmail)?.text).toContain(code);
    expect(smsCallTo(sms, invitedPhone)?.body).toContain(code);
  });

  it("sends an email copy to each verified parent alongside the IN_APP notification", async () => {
    const email = registerFakeEmail();

    const { tenant, subdomain } = await createTenant("ChannelsTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("chan-notif-admin");
    createdUserIds.push(admin.id);
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);
    const adminToken = signAccessToken({ sub: admin.id });

    const teacherUser = await createUser("chan-notif-teacher");
    createdUserIds.push(teacherUser.id);
    await addMembership(teacherUser.id, tenant.id);
    await grantRole(teacherUser.id, "TEACHER", tenant.id);
    const teacherToken = signAccessToken({ sub: teacherUser.id });

    const student = await createStudent(tenant.id, "CHANNOTIF");

    const parent = await createUser("chan-notif-parent");
    createdUserIds.push(parent.id);
    const parentToken = signAccessToken({ sub: parent.id });

    const invitation = await request(app)
      .post("/api/v1/family/invitations")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId: student.id, beneficiaryCategory: "PARENT", invitedEmail: parent.email });
    const redeemed = await request(app)
      .post("/api/v1/family/activation/redeem")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ code: (invitation.body as { code: string }).code });
    expect(redeemed.status).toBe(200);

    // La redemption declenche aussi un envoi email — on ne reinitialise le mock
    // qu'apres, pour isoler l'assertion sur l'incident ci-dessous.
    email.mockClear();

    const incident = await request(app)
      .post("/api/v1/discipline/incidents")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        studentId: student.id,
        occurredAt: new Date().toISOString().slice(0, 10),
        description: "Retard répété",
        severity: "MINOR",
      });
    expect(incident.status).toBe(201);

    expect(callTo(email, parent.email)?.text).toContain("incident");
  }, 30000);
});
