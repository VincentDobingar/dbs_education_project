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
    await testAdminPrisma.messageTemplate.deleteMany({
      where: {
        OR: [{ tenantId: { in: createdTenantIds } }, { tenantId: null, code: "discipline.incident" }],
      },
    });
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

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        employeeNumber: `EMP-${uniqueSuffix()}`,
        firstName: "Jean",
        lastName: "Mballa",
        jobTitle: "Enseignant",
        userId: teacherUser.id,
      });

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

  it("lets a parent opt out of the EMAIL copy for a notification category (NotificationPreference)", async () => {
    const email = registerFakeEmail();

    const { tenant, subdomain } = await createTenant("ChannelsTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("chan-pref-admin");
    createdUserIds.push(admin.id);
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);
    const adminToken = signAccessToken({ sub: admin.id });

    const teacherUser = await createUser("chan-pref-teacher");
    createdUserIds.push(teacherUser.id);
    await addMembership(teacherUser.id, tenant.id);
    await grantRole(teacherUser.id, "TEACHER", tenant.id);
    const teacherToken = signAccessToken({ sub: teacherUser.id });

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        employeeNumber: `EMP-${uniqueSuffix()}`,
        firstName: "Jean",
        lastName: "Mballa",
        jobTitle: "Enseignant",
        userId: teacherUser.id,
      });

    const student = await createStudent(tenant.id, "CHANPREF");

    const parent = await createUser("chan-pref-parent");
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
    email.mockClear();

    const rejectedChannel = await request(app)
      .put("/api/v1/communication/notification-preferences/SMS/discipline.incident")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ isEnabled: false });
    expect(rejectedChannel.status).toBe(400);

    const optOut = await request(app)
      .put("/api/v1/communication/notification-preferences/EMAIL/discipline.incident")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ isEnabled: false });
    expect(optOut.status).toBe(200);
    expect(optOut.body).toMatchObject({
      channel: "EMAIL",
      category: "discipline.incident",
      isEnabled: false,
    });

    const listed = await request(app)
      .get("/api/v1/communication/notification-preferences")
      .set("Authorization", `Bearer ${parentToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body as { channel: string; category: string; isEnabled: boolean }[]).toEqual([
      expect.objectContaining({ channel: "EMAIL", category: "discipline.incident", isEnabled: false }),
    ]);

    const firstIncident = await request(app)
      .post("/api/v1/discipline/incidents")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        studentId: student.id,
        occurredAt: new Date().toISOString().slice(0, 10),
        description: "Retard répété",
        severity: "MINOR",
      });
    expect(firstIncident.status).toBe(201);
    expect(callTo(email, parent.email)).toBeUndefined();

    const optIn = await request(app)
      .put("/api/v1/communication/notification-preferences/EMAIL/discipline.incident")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ isEnabled: true });
    expect(optIn.status).toBe(200);

    const secondIncident = await request(app)
      .post("/api/v1/discipline/incidents")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        studentId: student.id,
        occurredAt: new Date().toISOString().slice(0, 10),
        description: "Bagarre",
        severity: "SEVERE",
      });
    expect(secondIncident.status).toBe(201);
    expect(callTo(email, parent.email)?.text).toContain("SEVERE");
  }, 30000);

  it("dresses the EMAIL copy with a MessageTemplate (global, then tenant override, locale-aware)", async () => {
    const email = registerFakeEmail();

    const { tenant, subdomain } = await createTenant("ChannelsTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("chan-tpl-admin");
    createdUserIds.push(admin.id);
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);
    const adminToken = signAccessToken({ sub: admin.id });

    const teacherUser = await createUser("chan-tpl-teacher");
    createdUserIds.push(teacherUser.id);
    await addMembership(teacherUser.id, tenant.id);
    await grantRole(teacherUser.id, "TEACHER", tenant.id);
    const teacherToken = signAccessToken({ sub: teacherUser.id });

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        employeeNumber: `EMP-${uniqueSuffix()}`,
        firstName: "Jean",
        lastName: "Mballa",
        jobTitle: "Enseignant",
        userId: teacherUser.id,
      });

    const student = await createStudent(tenant.id, "CHANTPL");

    const parent = await createUser("chan-tpl-parent");
    createdUserIds.push(parent.id);
    const parentToken = signAccessToken({ sub: parent.id });
    await testAdminPrisma.userProfile.update({ where: { userId: parent.id }, data: { locale: "en" } });

    await testAdminPrisma.messageTemplate.create({
      data: {
        tenantId: null,
        code: "discipline.incident",
        channel: "EMAIL",
        subject: "Global: incident notice",
        bodyFr: "Cher parent, {{message}} Cordialement.",
        bodyEn: "Dear parent, {{message}} Regards.",
      },
    });

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
    email.mockClear();

    const globalTemplateIncident = await request(app)
      .post("/api/v1/discipline/incidents")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        studentId: student.id,
        occurredAt: new Date().toISOString().slice(0, 10),
        description: "Retard répété",
        severity: "MINOR",
      });
    expect(globalTemplateIncident.status).toBe(201);

    const globalCall = callTo(email, parent.email);
    expect(globalCall?.subject).toBe("Global: incident notice");
    expect(globalCall?.text).toContain("Dear parent,");
    expect(globalCall?.text).toContain("Regards.");
    expect(globalCall?.text).toContain("MINOR");

    await testAdminPrisma.messageTemplate.create({
      data: {
        tenantId: tenant.id,
        code: "discipline.incident",
        channel: "EMAIL",
        subject: "Tenant-specific: incident notice",
        bodyFr: "Bonjour, {{message}} — l'équipe de l'établissement.",
        bodyEn: "Hello, {{message}} — the school team.",
      },
    });
    email.mockClear();

    const tenantTemplateIncident = await request(app)
      .post("/api/v1/discipline/incidents")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        studentId: student.id,
        occurredAt: new Date().toISOString().slice(0, 10),
        description: "Bagarre",
        severity: "SEVERE",
      });
    expect(tenantTemplateIncident.status).toBe(201);

    const tenantCall = callTo(email, parent.email);
    expect(tenantCall?.subject).toBe("Tenant-specific: incident notice");
    expect(tenantCall?.text).toContain("Hello,");
    expect(tenantCall?.text).toContain("the school team.");
    expect(tenantCall?.text).toContain("SEVERE");
  }, 30000);

  it("notifies the ticket author by email + SMS when platform staff replies, never for an internal note", async () => {
    const email = registerFakeEmail();
    const sms = registerFakeSms();

    const { tenant, subdomain } = await createTenant("ChannelsTenant");
    createdTenantIds.push(tenant.id);

    const owner = await createUser("chan-ticket-owner");
    createdUserIds.push(owner.id);
    await addMembership(owner.id, tenant.id);
    await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);
    const ownerToken = signAccessToken({ sub: owner.id });

    const ownerPhone = `+237698${uniqueSuffix().slice(0, 6)}`;
    await testAdminPrisma.user.update({ where: { id: owner.id }, data: { phone: ownerPhone } });

    const superAdmin = await createUser("chan-ticket-super");
    createdUserIds.push(superAdmin.id);
    await grantRole(superAdmin.id, "SUPER_ADMIN", null);
    const superAdminToken = signAccessToken({ sub: superAdmin.id });

    const ticket = await request(app)
      .post("/api/v1/communication/support-tickets")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ subject: "Question de facturation" });
    expect(ticket.status).toBe(201);
    const ticketId = (ticket.body as { id: string }).id;

    const internalNote = await request(app)
      .post(`/api/v1/platform/support-tickets/${ticketId}/messages`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ body: "Internal note, never sent to the customer", isInternalNote: true });
    expect(internalNote.status).toBe(201);
    expect(callTo(email, owner.email)).toBeUndefined();

    const reply = await request(app)
      .post(`/api/v1/platform/support-tickets/${ticketId}/messages`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ body: "Here is the reply to your billing question" });
    expect(reply.status).toBe(201);

    expect(callTo(email, owner.email)?.text).toContain("Here is the reply");
    expect(smsCallTo(sms, ownerPhone)?.body).toContain("Here is the reply");
  }, 20000);
});
