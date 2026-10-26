import request from "supertest";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import {
  registerEmailProviderAdapter,
  resetEmailProviderAdapter,
} from "../../lib/email-provider/registry.js";
import type { SendEmailInput } from "../../lib/email-provider/types.js";
import { signAccessToken } from "../../lib/jwt.js";
import { transitionSubscription } from "../../modules/subscriptions/subscription.service.js";
import { testAdminPrisma as db } from "../admin-client.js";
import {
  addMembership,
  createStudent,
  createTenant,
  createUser,
  grantRole,
  uniqueSuffix,
} from "../fixtures.js";

describe("profil parent central et couvertures explicites multi-établissements", () => {
  const app = createApp();
  const tenantIds: string[] = [];
  const userIds: string[] = [];
  const planIds: string[] = [];
  afterEach(() => resetEmailProviderAdapter());
  afterAll(async () => {
    const scope = { tenantId: { in: tenantIds } };
    const subscriptionScope = {
      owner: { OR: [{ tenantId: { in: tenantIds } }, { familyAccount: { primaryUserId: { in: userIds } } }] },
    };
    await db.receipt.deleteMany({
      where: { paymentTransaction: { paymentIntent: { invoice: { subscription: subscriptionScope } } } },
    });
    await db.paymentTransaction.deleteMany({
      where: { paymentIntent: { invoice: { subscription: subscriptionScope } } },
    });
    await db.paymentIntent.deleteMany({ where: { invoice: { subscription: subscriptionScope } } });
    await db.invoice.deleteMany({ where: { subscription: subscriptionScope } });
    await db.subscription.deleteMany({ where: subscriptionScope });
    await db.billingAccount.deleteMany({ where: { owner: subscriptionScope.owner } });
    await db.subscriptionOwner.deleteMany({ where: subscriptionScope.owner });
    await db.activationCode.deleteMany({ where: { invitation: scope } });
    await db.activationInvitation.deleteMany({ where: scope });
    await db.student.deleteMany({ where: scope });
    await db.schoolGuardian.deleteMany({ where: scope });
    await db.familyMember.deleteMany({ where: { familyAccount: { primaryUserId: { in: userIds } } } });
    await db.familyAccount.deleteMany({ where: { primaryUserId: { in: userIds } } });
    await db.guardian.deleteMany({ where: { userId: { in: userIds } } });
    await db.parentContactChange.deleteMany({ where: { userId: { in: userIds } } });
    await db.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
    await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await db.tenantMembership.deleteMany({ where: scope });
    await db.tenantDomain.deleteMany({ where: scope });
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } });
  });
  async function parent() {
    const user = await createUser("central-parent");
    userIds.push(user.id);
    await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    return { user, token: signAccessToken({ sub: user.id }) };
  }
  async function school(parentUser: Awaited<ReturnType<typeof parent>>, redeem = true) {
    const { tenant, subdomain } = await createTenant("CentralParentSchool");
    tenantIds.push(tenant.id);
    const staff = await createUser("central-school-admin");
    userIds.push(staff.id);
    await addMembership(staff.id, tenant.id);
    await grantRole(staff.id, "SCHOOL_OWNER", tenant.id);
    const staffHeaders = {
      Authorization: `Bearer ${signAccessToken({ sub: staff.id })}`,
      "X-Tenant-Slug": subdomain,
    };
    const guardian = await db.schoolGuardian.create({
      data: {
        tenantId: tenant.id,
        firstName: "Marie",
        lastName: "Diallo",
        email: parentUser.user.email,
        phone: "+237600000000",
      },
    });
    const student = await createStudent(tenant.id);
    await db.student.update({ where: { id: student.id }, data: { primaryGuardianId: guardian.id } });
    const invited = await request(app)
      .post("/api/v1/family/invitations")
      .set(staffHeaders)
      .send({ studentId: student.id, beneficiaryCategory: "PARENT", invitedEmail: parentUser.user.email });
    expect(invited.status).toBe(201);
    const code = (invited.body as { code: string }).code;
    if (redeem)
      expect(
        (
          await request(app)
            .post("/api/v1/family/activation/redeem")
            .set("Authorization", `Bearer ${parentUser.token}`)
            .send({ code })
        ).status,
      ).toBe(200);
    return {
      tenant,
      student,
      guardian,
      staffHeaders,
      code,
      selection: { studentId: student.id, tenantId: tenant.id },
    };
  }
  async function familyPlan() {
    const plan = await db.subscriptionPlan.create({
      data: {
        code: `PARENT_FAMILY_${uniqueSuffix()}`,
        category: "PARENT",
        nameFr: "Famille test",
        nameEn: "Family test",
        childrenCovered: 2,
      },
    });
    planIds.push(plan.id);
    const currency = await db.currency.findUniqueOrThrow({ where: { isoCode: "XAF" } });
    await db.planPrice.create({
      data: { planId: plan.id, currencyId: currency.id, billingPeriod: "MONTHLY", amountCents: 4000 },
    });
    return plan;
  }
  async function subscribe(
    p: Awaited<ReturnType<typeof parent>>,
    children: { studentId: string; tenantId: string }[],
    planCode = "PARENT_BASIC",
  ) {
    return request(app)
      .post("/api/v1/parent-portal/subscriptions")
      .set("Authorization", `Bearer ${p.token}`)
      .send({ planCode, billingPeriod: "MONTHLY", children });
  }
  async function pay(p: Awaited<ReturnType<typeof parent>>, id: string) {
    const invoice = await request(app)
      .post(`/api/v1/parent-portal/subscriptions/${id}/invoice`)
      .set("Authorization", `Bearer ${p.token}`)
      .send({ currencyIsoCode: "XAF", billingName: "Parent test", billingEmail: p.user.email });
    expect(invoice.status).toBe(201);
    const intent = await request(app)
      .post(`/api/v1/parent-portal/subscriptions/${id}/payment-intent`)
      .set("Authorization", `Bearer ${p.token}`)
      .send({ invoiceId: (invoice.body as { id: string }).id, providerCode: "CASH_AGENT" });
    expect(intent.status).toBe(201);
    const paymentIntentId = (intent.body as { id: string }).id;
    expect(
      (
        await request(app)
          .post("/api/v1/subscriptions/family/cash-payment")
          .set("Authorization", `Bearer ${p.token}`)
          .send({ paymentIntentId })
      ).status,
    ).toBe(403);
    const agent = await createUser("parent-payment-agent");
    userIds.push(agent.id);
    await grantRole(agent.id, "SUPER_ADMIN", null);
    const payment = await request(app)
      .post(`/api/v1/platform/parent-subscriptions/${id}/cash-payment`)
      .set("Authorization", `Bearer ${signAccessToken({ sub: agent.id })}`)
      .send({ paymentIntentId, justification: "Règlement reçu et contrôlé" });
    expect(payment.status).toBe(200);
  }
  it("relie seulement les invitations vérifiées et synchronise les coordonnées dans deux établissements", async () => {
    const p = await parent();
    expect(
      (await request(app).get("/api/v1/parent-portal/profile").set("Authorization", `Bearer ${p.token}`))
        .status,
    ).toBe(200);
    const a = await school(p);
    const b = await school(p);
    const pending = await school(p, false);
    const update = await request(app)
      .patch("/api/v1/parent-portal/profile")
      .set("Authorization", `Bearer ${p.token}`)
      .send({ firstName: "Mariam", lastName: "Nouveau nom", address: "Douala" });
    expect(update.status).toBe(200);
    for (const id of [a.guardian.id, b.guardian.id])
      expect(await db.schoolGuardian.findUnique({ where: { id } })).toMatchObject({
        firstName: "Mariam",
        lastName: "Nouveau nom",
        address: "Douala",
        phone: "+237600000000",
      });
    expect(await db.schoolGuardian.findUnique({ where: { id: pending.guardian.id } })).toMatchObject({
      firstName: "Marie",
      centralGuardianId: null,
    });
    const adminUpdate = await request(app)
      .patch(`/api/v1/registrations/guardians/${a.guardian.id}`)
      .set(a.staffHeaders)
      .send({
        firstName: "Mariam admin",
        lastName: "Nom central",
        phone: "+237600222333",
        email: "contact-parent@example.test",
        address: "Yaoundé admin",
      });
    expect(adminUpdate.status).toBe(200);
    for (const id of [a.guardian.id, b.guardian.id])
      expect(await db.schoolGuardian.findUnique({ where: { id } })).toMatchObject({
        firstName: "Mariam admin",
        phone: "+237600222333",
        address: "Yaoundé admin",
        email: "contact-parent@example.test",
      });
    const portalProfile = await request(app)
      .get("/api/v1/parent-portal/profile")
      .set("Authorization", `Bearer ${p.token}`);
    expect(portalProfile.body).toMatchObject({
      firstName: "Mariam admin",
      phone: "+237600222333",
      address: "Yaoundé admin",
    });
    expect((await db.user.findUniqueOrThrow({ where: { id: p.user.id } })).email).toBe(p.user.email);
    const photo = await request(app)
      .post(`/api/v1/registrations/guardians/${a.guardian.id}/photo`)
      .set(a.staffHeaders)
      .attach(
        "photo",
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU1sAAAAASUVORK5CYII=",
          "base64",
        ),
        { filename: "parent.png", contentType: "image/png" },
      );
    expect(photo.status).toBe(200);
    const photoUrl = (photo.body as { photoUrl: string }).photoUrl;
    expect(photoUrl).toContain("/uploads/guardian-photos/");
    expect((await db.schoolGuardian.findUniqueOrThrow({ where: { id: b.guardian.id } })).photoUrl).toBe(
      photoUrl,
    );
    const portalPhoto = await request(app)
      .get("/api/v1/parent-portal/profile")
      .set("Authorization", `Bearer ${p.token}`);
    expect((portalPhoto.body as { photoUrl: string }).photoUrl).toBe(photoUrl);
    const crossSchool = await request(app)
      .patch(`/api/v1/registrations/guardians/${a.guardian.id}`)
      .set(b.staffHeaders)
      .send({ firstName: "Intrus", lastName: "X", phone: "1234" });
    expect(crossSchool.status).toBe(404);
    const stranger = await parent();
    expect(
      (
        await request(app)
          .post("/api/v1/family/activation/redeem")
          .set("Authorization", `Bearer ${stranger.token}`)
          .send({ code: pending.code })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch("/api/v1/parent-portal/profile")
          .set("Authorization", `Bearer ${stranger.token}`)
          .send({ userId: p.user.id, firstName: "X", lastName: "Y", address: null })
      ).status,
    ).toBe(400);
    await db.parentStudentRelationship.updateMany({
      where: { parentUserId: p.user.id, studentId: b.student.id },
      data: { revokedAt: new Date(), status: "REVOKED" },
    });
    await request(app)
      .patch("/api/v1/parent-portal/profile")
      .set("Authorization", `Bearer ${p.token}`)
      .send({ firstName: "Après révocation", lastName: "Nom", address: null });
    expect(await db.schoolGuardian.findUnique({ where: { id: b.guardian.id } })).toMatchObject({
      firstName: "Mariam admin",
    });
    const revokedSource = await request(app)
      .patch(`/api/v1/registrations/guardians/${b.guardian.id}`)
      .set(b.staffHeaders)
      .send({ firstName: "Intrus", lastName: "X", phone: "1234" });
    expect(revokedSource.status).toBe(403);
  }, 30000);
  it("vérifie le nouveau contact, borne les essais et ne renvoie jamais le code dans l'API", async () => {
    const p = await parent();
    const a = await school(p);
    const messages: SendEmailInput[] = [];
    registerEmailProviderAdapter({
      code: "TEST",
      send: (message) => {
        messages.push(message);
        return Promise.resolve();
      },
    });
    const value = `new-${uniqueSuffix()}@example.test`;
    const start = () =>
      request(app)
        .post("/api/v1/parent-portal/profile/contact-changes")
        .set("Authorization", `Bearer ${p.token}`)
        .send({ channel: "EMAIL", value, password: "Sup3r-Secret-Passw0rd!" });
    const challenge = await start();
    expect(challenge.status).toBe(201);
    expect(challenge.body as unknown).not.toHaveProperty("code");
    const id = (challenge.body as { id: string }).id;
    for (let i = 0; i < 5; i++)
      expect(
        (
          await request(app)
            .post(`/api/v1/parent-portal/profile/contact-changes/${id}/confirm`)
            .set("Authorization", `Bearer ${p.token}`)
            .send({ code: "000000" })
        ).status,
      ).toBe(400);
    const correctOld = messages.at(-1)!.text.match(/\d{6}/)![0];
    expect(
      (
        await request(app)
          .post(`/api/v1/parent-portal/profile/contact-changes/${id}/confirm`)
          .set("Authorization", `Bearer ${p.token}`)
          .send({ code: correctOld })
      ).status,
    ).toBe(400);
    expect((await db.user.findUniqueOrThrow({ where: { id: p.user.id } })).email).toBe(p.user.email);
    const second = await start();
    const secondId = (second.body as { id: string }).id;
    const correct = messages.at(-1)!.text.match(/\d{6}/)![0];
    const stranger = await parent();
    expect(
      (
        await request(app)
          .post(`/api/v1/parent-portal/profile/contact-changes/${secondId}/confirm`)
          .set("Authorization", `Bearer ${stranger.token}`)
          .send({ code: correct })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post(`/api/v1/parent-portal/profile/contact-changes/${secondId}/confirm`)
          .set("Authorization", `Bearer ${p.token}`)
          .send({ code: correct })
      ).status,
    ).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { id: p.user.id } })).email).toBe(value);
    expect((await db.schoolGuardian.findUniqueOrThrow({ where: { id: a.guardian.id } })).email).toBe(value);
    expect(
      (
        await request(app)
          .post(`/api/v1/parent-portal/profile/contact-changes/${secondId}/confirm`)
          .set("Authorization", `Bearer ${p.token}`)
          .send({ code: correct })
      ).status,
    ).toBe(400);
  }, 30000);
  it("ne révèle que l'enfant couvert et conserve la couverture active quand un autre abonnement est en brouillon", async () => {
    const p = await parent();
    const a = await school(p);
    const b = await school(p);
    const created = await subscribe(p, [a.selection]);
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;
    const dashboard = () =>
      request(app).get("/api/v1/parent-portal/dashboard").set("Authorization", `Bearer ${p.token}`);
    expect(((await dashboard()).body as { children: unknown[] }).children).toEqual([]);
    expect(
      (
        await request(app)
          .get(`/api/v1/parent-portal/children/${a.student.id}/attendance`)
          .set("Authorization", `Bearer ${p.token}`)
      ).status,
    ).toBe(402);
    await pay(p, id);
    expect(
      ((await dashboard()).body as { children: { student: { id: string } }[] }).children.map(
        (c) => c.student.id,
      ),
    ).toEqual([a.student.id]);
    expect(
      (
        await request(app)
          .get(`/api/v1/parent-portal/children/${b.student.id}/attendance`)
          .set("Authorization", `Bearer ${p.token}`)
      ).status,
    ).toBe(402);
    expect((await subscribe(p, [b.selection])).status).toBe(201);
    expect(
      (
        await request(app)
          .get(`/api/v1/parent-portal/children/${a.student.id}/attendance`)
          .set("Authorization", `Bearer ${p.token}`)
      ).status,
    ).toBe(200);
    await db.subscription.update({
      where: { id },
      data: { currentPeriodEndsAt: new Date(Date.now() - 1000) },
    });
    expect(((await dashboard()).body as { children: unknown[] }).children).toEqual([]);
    expect(
      (
        await request(app)
          .get(`/api/v1/parent-portal/children/${a.student.id}/attendance`)
          .set("Authorization", `Bearer ${p.token}`)
      ).status,
    ).toBe(402);
  }, 30000);
  it("empêche la réactivation d'un ancien contrat si une nouvelle couverture réserve déjà l'enfant", async () => {
    const p = await parent();
    const a = await school(p);
    const initial = await subscribe(p, [a.selection]);
    const id = (initial.body as { id: string }).id;
    await pay(p, id);
    await transitionSubscription(id, "EXPIRED");
    expect((await subscribe(p, [a.selection])).status).toBe(201);
    await expect(transitionSubscription(id, "ACTIVE")).rejects.toMatchObject({
      code: "CHILD_COVERAGE_CONFLICT",
    });
    expect((await db.subscription.findUniqueOrThrow({ where: { id } })).status).toBe("EXPIRED");
  }, 30000);
  it("borne le forfait familial, refuse les doublons concurrents et couvre les deux établissements après activation", async () => {
    const p = await parent();
    const a = await school(p);
    const b = await school(p);
    const family = await familyPlan();
    expect((await subscribe(p, [a.selection, b.selection])).status).toBe(422);
    const results = await Promise.all([
      subscribe(p, [a.selection, b.selection], family.code),
      subscribe(p, [a.selection, b.selection], family.code),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const id = (results.find((r) => r.status === 201)!.body as { id: string }).id;
    await pay(p, id);
    const dashboard = await request(app)
      .get("/api/v1/parent-portal/dashboard")
      .set("Authorization", `Bearer ${p.token}`);
    expect(
      (dashboard.body as { children: { student: { id: string } }[] }).children
        .map((c) => c.student.id)
        .sort(),
    ).toEqual([a.student.id, b.student.id].sort());
    const stranger = await parent();
    expect((await subscribe(stranger, [a.selection])).status).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/v1/parent-portal/subscriptions/${id}/cancel`)
          .set("Authorization", `Bearer ${p.token}`)
          .send({ reason: "Test" })
      ).status,
    ).toBe(200);
    expect(
      await db.parentSubscriptionCoverage.count({ where: { subscriptionId: id, releasedAt: null } }),
    ).toBe(0);
    expect((await subscribe(p, [a.selection])).status).toBe(201);
  }, 30000);
});
