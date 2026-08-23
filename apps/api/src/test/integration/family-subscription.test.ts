import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import * as subscriptionService from "../../modules/subscriptions/subscription.service.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createStudent, createTenant, createUser, grantRole } from "../fixtures.js";

describe("abonnement familial en libre-service (§9)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.receipt.deleteMany({
      where: {
        paymentTransaction: {
          paymentIntent: {
            invoice: {
              subscription: { owner: { familyAccount: { primaryUserId: { in: createdUserIds } } } },
            },
          },
        },
      },
    });
    await testAdminPrisma.paymentTransaction.deleteMany({
      where: {
        paymentIntent: {
          invoice: { subscription: { owner: { familyAccount: { primaryUserId: { in: createdUserIds } } } } },
        },
      },
    });
    await testAdminPrisma.paymentIntent.deleteMany({
      where: {
        invoice: { subscription: { owner: { familyAccount: { primaryUserId: { in: createdUserIds } } } } },
      },
    });
    await testAdminPrisma.invoiceItem.deleteMany({
      where: {
        invoice: { subscription: { owner: { familyAccount: { primaryUserId: { in: createdUserIds } } } } },
      },
    });
    await testAdminPrisma.invoice.deleteMany({
      where: { subscription: { owner: { familyAccount: { primaryUserId: { in: createdUserIds } } } } },
    });
    await testAdminPrisma.billingAccount.deleteMany({
      where: { owner: { familyAccount: { primaryUserId: { in: createdUserIds } } } },
    });
    await testAdminPrisma.entitlement.deleteMany({
      where: { subscription: { owner: { familyAccount: { primaryUserId: { in: createdUserIds } } } } },
    });
    await testAdminPrisma.subscriptionEvent.deleteMany({
      where: { subscription: { owner: { familyAccount: { primaryUserId: { in: createdUserIds } } } } },
    });
    await testAdminPrisma.subscription.deleteMany({
      where: { owner: { familyAccount: { primaryUserId: { in: createdUserIds } } } },
    });
    await testAdminPrisma.subscriptionOwner.deleteMany({
      where: { familyAccount: { primaryUserId: { in: createdUserIds } } },
    });
    await testAdminPrisma.familyMember.deleteMany({
      where: { familyAccount: { primaryUserId: { in: createdUserIds } } },
    });
    await testAdminPrisma.familyAccount.deleteMany({ where: { primaryUserId: { in: createdUserIds } } });
    await testAdminPrisma.guardian.deleteMany({ where: { userId: { in: createdUserIds } } });
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
  });

  async function inviteAndRedeemChild(parentToken: string, parentEmail: string): Promise<number> {
    const { tenant, subdomain } = await createTenant("FamilySubTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("famsub-admin");
    createdUserIds.push(admin.id);
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);
    const adminToken = signAccessToken({ sub: admin.id });

    const student = await createStudent(tenant.id);

    const invitation = await request(app)
      .post("/api/v1/family/invitations")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId: student.id, beneficiaryCategory: "PARENT", invitedEmail: parentEmail });
    const { code } = invitation.body as { code: string };

    const redeemed = await request(app)
      .post("/api/v1/family/activation/redeem")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ code });
    return redeemed.status;
  }

  it("crée un compte familial, plafonne le nombre d'enfants, et refuse un doublon", async () => {
    const parent = await createUser("famsub-parent");
    createdUserIds.push(parent.id);
    const parentToken = signAccessToken({ sub: parent.id });

    const notFound = await request(app)
      .get("/api/v1/family/family-account")
      .set("Authorization", `Bearer ${parentToken}`);
    expect(notFound.status).toBe(404);

    const created = await request(app)
      .post("/api/v1/family/family-account")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ maxChildren: 1 });
    expect(created.status).toBe(201);
    const body = created.body as {
      id: string;
      maxChildren: number;
      members: { roleInFamily: string; guardian: { userId: string } }[];
    };
    expect(body.maxChildren).toBe(1);
    expect(body.members).toHaveLength(1);
    expect(body.members[0]?.roleInFamily).toBe("PRIMARY");
    expect(body.members[0]?.guardian.userId).toBe(parent.id);
    const familyAccountId = body.id;

    const duplicate = await request(app)
      .post("/api/v1/family/family-account")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({});
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as { code: string }).code).toBe("FAMILY_ACCOUNT_ALREADY_EXISTS");

    const fetched = await request(app)
      .get("/api/v1/family/family-account")
      .set("Authorization", `Bearer ${parentToken}`);
    expect(fetched.status).toBe(200);
    expect((fetched.body as { id: string }).id).toBe(familyAccountId);

    // Premier enfant : sous le plafond (1), accepté.
    const firstChildStatus = await inviteAndRedeemChild(parentToken, parent.email);
    expect(firstChildStatus).toBe(200);

    // Second enfant, établissement différent (§9 : accès inter-tenant) : plafond
    // atteint, refusé — jamais une simple limite par tenant.
    const secondChildStatus = await inviteAndRedeemChild(parentToken, parent.email);
    expect(secondChildStatus).toBe(409);

    // Relève le plafond : le second enfant peut désormais être rattaché.
    const raised = await request(app)
      .patch("/api/v1/family/family-account")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ maxChildren: 2 });
    expect(raised.status).toBe(200);
    expect((raised.body as { maxChildren: number }).maxChildren).toBe(2);

    const secondChildRetry = await inviteAndRedeemChild(parentToken, parent.email);
    expect(secondChildRetry).toBe(200);
  }, 30000);

  it("souscrit, facture, encaisse et annule un abonnement familial — jamais celui d'un autre parent", async () => {
    const parent = await createUser("famsub-billing-parent");
    createdUserIds.push(parent.id);
    const parentToken = signAccessToken({ sub: parent.id });

    const noAccountDenied = await request(app)
      .post("/api/v1/subscriptions/family")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ planCode: "PARENT_BASIC", billingPeriod: "MONTHLY" });
    expect(noAccountDenied.status).toBe(404);
    expect((noAccountDenied.body as { code: string }).code).toBe("FAMILY_ACCOUNT_NOT_FOUND");

    await request(app)
      .post("/api/v1/family/family-account")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({});

    const subscription = await request(app)
      .post("/api/v1/subscriptions/family")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ planCode: "PARENT_BASIC", billingPeriod: "MONTHLY" });
    expect(subscription.status).toBe(201);
    const subscriptionBody = subscription.body as { id: string; status: string };
    expect(subscriptionBody.status).toBe("DRAFT");

    const fetchedSubscription = await request(app)
      .get("/api/v1/subscriptions/family")
      .set("Authorization", `Bearer ${parentToken}`);
    expect(fetchedSubscription.status).toBe(200);
    expect((fetchedSubscription.body as { id: string }).id).toBe(subscriptionBody.id);

    // Un second parent, sans compte familial, ne doit jamais atteindre l'abonnement du premier.
    const otherParent = await createUser("famsub-other-parent");
    createdUserIds.push(otherParent.id);
    const otherParentToken = signAccessToken({ sub: otherParent.id });
    const otherNoAccount = await request(app)
      .get("/api/v1/subscriptions/family")
      .set("Authorization", `Bearer ${otherParentToken}`);
    expect(otherNoAccount.status).toBe(404);
    expect((otherNoAccount.body as { code: string }).code).toBe("FAMILY_ACCOUNT_NOT_FOUND");

    const invoice = await request(app)
      .post("/api/v1/subscriptions/family/invoice")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ currencyIsoCode: "XAF", billingName: "Test Parent", billingEmail: parent.email });
    expect(invoice.status).toBe(201);
    const invoiceId = (invoice.body as { id: string }).id;

    const intent = await request(app)
      .post("/api/v1/subscriptions/family/payment-intent")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ invoiceId, providerCode: "CASH_AGENT" });
    expect(intent.status).toBe(201);
    const paymentIntentId = (intent.body as { id: string }).id;

    // DRAFT -> ACTIVE exige de passer par PENDING_PAYMENT (subscription-transitions.ts) —
    // aucune route self-service ne l'expose encore, même limite déjà en place côté
    // "school" (subscriptions.routes.ts n'a pas non plus cette transition en HTTP).
    await subscriptionService.transitionSubscription(subscriptionBody.id, "PENDING_PAYMENT");

    const cashPayment = await request(app)
      .post("/api/v1/subscriptions/family/cash-payment")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ paymentIntentId });
    expect(cashPayment.status).toBe(200);

    const activeSubscription = await request(app)
      .get("/api/v1/subscriptions/family")
      .set("Authorization", `Bearer ${parentToken}`);
    expect((activeSubscription.body as { status: string }).status).toBe("ACTIVE");

    // §18 : le tableau de bord parent expose désormais cet abonnement.
    const dashboard = await request(app)
      .get("/api/v1/parent-portal/dashboard")
      .set("Authorization", `Bearer ${parentToken}`);
    expect((dashboard.body as { subscription: { id: string } }).subscription.id).toBe(subscriptionBody.id);

    const cancelled = await request(app)
      .post(`/api/v1/subscriptions/family/${subscriptionBody.id}/cancel`)
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ reason: "Test" });
    expect(cancelled.status).toBe(200);
    expect((cancelled.body as { status: string }).status).toBe("CANCELLED");
  }, 30000);

  // §37 : « le front ne peut pas forger son statut/plan » — createFamilySubscriptionSchema
  // n'accepte que planCode/billingPeriod/promoCode, et le contrôleur fixe lui-même
  // status/fundingSource/ownerRef : tout champ privilégié envoyé par le client doit être
  // silencieusement ignoré, jamais reflété dans la ligne créée.
  it("ignores a forged status/planId/fundingSource in the subscription creation body", async () => {
    const parent = await createUser("famsub-forge-parent");
    createdUserIds.push(parent.id);
    const parentToken = signAccessToken({ sub: parent.id });

    await request(app)
      .post("/api/v1/family/family-account")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({});

    const realPlan = await testAdminPrisma.subscriptionPlan.findUniqueOrThrow({
      where: { code: "PARENT_BASIC" },
    });
    const otherPlan = await testAdminPrisma.subscriptionPlan.findUniqueOrThrow({
      where: { code: "PARENT_PREMIUM" },
    });

    const forged = await request(app)
      .post("/api/v1/subscriptions/family")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({
        planCode: "PARENT_BASIC",
        billingPeriod: "MONTHLY",
        status: "ACTIVE",
        planId: otherPlan.id,
        fundingSource: "ORGANIZATION_SPONSORED",
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
});
