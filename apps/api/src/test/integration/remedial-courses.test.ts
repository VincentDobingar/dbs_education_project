import { createHmac } from "node:crypto";

import request from "supertest";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { KonoomPaymentAdapter } from "../../modules/payments/payment-providers/konoom-provider.js";
import {
  registerPaymentProviderAdapter,
  resetPaymentProviderAdaptersForTests,
} from "../../modules/payments/payment-providers/registry.js";
import { testAdminPrisma } from "../admin-client.js";
import {
  addMembership,
  createStudent,
  createTenant,
  createUser,
  createVerifiedRelationship,
  grantRole,
  uniqueSuffix,
} from "../fixtures.js";

const WEBHOOK_SECRET = "whsec_remedial_test";

describe("cours de renforcement entre établissements", () => {
  const app = createApp();
  const tenantIds: string[] = [];
  const userIds: string[] = [];

  afterEach(() => {
    resetPaymentProviderAdaptersForTests();
  });

  afterAll(async () => {
    const enrollments = await testAdminPrisma.remedialEnrollment.findMany({
      where: { offerTenantId: { in: tenantIds } },
      select: { id: true },
    });
    const enrollmentIds = enrollments.map((enrollment) => enrollment.id);
    const intents = await testAdminPrisma.paymentIntent.findMany({
      where: { remedialEnrollmentId: { in: enrollmentIds } },
      select: { id: true },
    });
    const intentIds = intents.map((intent) => intent.id);
    await testAdminPrisma.receipt.deleteMany({
      where: { paymentTransaction: { paymentIntentId: { in: intentIds } } },
    });
    await testAdminPrisma.paymentTransaction.deleteMany({ where: { paymentIntentId: { in: intentIds } } });
    await testAdminPrisma.paymentWebhookEvent.deleteMany({
      where: { externalEventId: { startsWith: "evt-rc-" } },
    });
    await testAdminPrisma.paymentIntent.deleteMany({ where: { id: { in: intentIds } } });
    await testAdminPrisma.remedialPayoutLine.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
    await testAdminPrisma.remedialEnrollment.deleteMany({ where: { id: { in: enrollmentIds } } });
    await testAdminPrisma.remedialOffer.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await testAdminPrisma.remedialTariff.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await testAdminPrisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await testAdminPrisma.parentStudentRelationship.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await testAdminPrisma.studentUserLink.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await testAdminPrisma.student.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await testAdminPrisma.employee.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await testAdminPrisma.subscription.deleteMany({ where: { owner: { tenantId: { in: tenantIds } } } });
    await testAdminPrisma.subscriptionOwner.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  });

  it("grille validée, offre approuvée, inscription d'un élève d'un autre établissement, paiement espèces puis Konoom, répartition", async () => {
    // Établissement A : propriétaire et enseignant.
    const { tenant: schoolA, subdomain: slugA } = await createTenant("RemedialA");
    tenantIds.push(schoolA.id);
    const owner = await createUser("rc-owner");
    const teacher = await createUser("rc-teacher");
    userIds.push(owner.id, teacher.id);
    await addMembership(owner.id, schoolA.id);
    await grantRole(owner.id, "SCHOOL_OWNER", schoolA.id);
    await addMembership(teacher.id, schoolA.id);
    await grantRole(teacher.id, "TEACHER", schoolA.id);
    await testAdminPrisma.employee.create({
      data: {
        tenantId: schoolA.id,
        userId: teacher.id,
        employeeNumber: `ENS-${uniqueSuffix()}`,
        firstName: "Awa",
        lastName: "Moussa",
        jobTitle: "Enseignante de mathématiques",
      },
    });
    const ownerToken = signAccessToken({ sub: owner.id });
    const teacherToken = signAccessToken({ sub: teacher.id });
    const asA = (token: string) => ({ Authorization: `Bearer ${token}`, "X-Tenant-Slug": slugA });

    // Établissement B : élève, parent vérifié, et un étranger.
    const { tenant: schoolB } = await createTenant("RemedialB");
    tenantIds.push(schoolB.id);
    const student = await createStudent(schoolB.id, "RC");
    const parent = await createUser("rc-parent");
    const stranger = await createUser("rc-stranger");
    userIds.push(parent.id, stranger.id);
    await createVerifiedRelationship(parent.id, student.id, schoolB.id);
    const parentToken = signAccessToken({ sub: parent.id });
    const strangerToken = signAccessToken({ sub: stranger.id });

    // 1. La grille est réservée à la direction.
    const tariffInput = {
      label: "Groupe — sur place",
      format: "GROUP",
      mode: "ONSITE",
      hourlyRateCents: 2_500,
      schoolShareBps: 2_000,
    };
    const teacherTariff = await request(app)
      .post("/api/v1/remedial/tariffs")
      .set(asA(teacherToken))
      .send(tariffInput);
    expect(teacherTariff.status).toBe(403);
    const tooGreedy = await request(app)
      .post("/api/v1/remedial/tariffs")
      .set(asA(ownerToken))
      .send({ ...tariffInput, schoolShareBps: 9_500 });
    expect(tooGreedy.status).toBe(400);
    const tariff = await request(app).post("/api/v1/remedial/tariffs").set(asA(ownerToken)).send(tariffInput);
    expect(tariff.status).toBe(201);
    const tariffId = (tariff.body as { id: string }).id;

    // 2. L'enseignant crée et soumet son offre ; le prix vient de la grille.
    const offerInput = {
      tariffId,
      subjectLabel: "Mathématiques",
      levelLabel: "3e",
      title: "Préparation au BEPC — mathématiques",
      description: "Révision des fonctions, du théorème de Thalès et des statistiques.",
      location: "Salle 4",
      accessDetails: "Apporter la calculatrice. Code d'accès au portail : 4421.",
      capacity: 2,
      totalMinutes: 360,
      startsOn: "2099-11-02",
      endsOn: "2099-12-18",
      scheduleNote: "Samedi 9 h – 12 h",
    };
    const created = await request(app)
      .post("/api/v1/remedial/offers")
      .set(asA(teacherToken))
      .send(offerInput);
    expect(created.status).toBe(201);
    const offer = created.body as {
      id: string;
      priceCents: number;
      status: string;
      platformShareBps: number;
    };
    expect(offer.status).toBe("DRAFT");
    expect(offer.priceCents).toBe(15_000); // 2 500 × 6 h

    const ownerReviewDraft = await request(app)
      .post(`/api/v1/remedial/offers/${offer.id}/review`)
      .set(asA(ownerToken))
      .send({ decision: "APPROVE" });
    expect(ownerReviewDraft.status).toBe(409);

    expect(
      (await request(app).post(`/api/v1/remedial/offers/${offer.id}/submit`).set(asA(teacherToken))).status,
    ).toBe(200);

    // Non publiée : absente du catalogue.
    const catalogBefore = await request(app).get("/api/v1/remedial-portal/catalog");
    expect((catalogBefore.body as { id: string }[]).some((entry) => entry.id === offer.id)).toBe(false);

    const teacherSelfReview = await request(app)
      .post(`/api/v1/remedial/offers/${offer.id}/review`)
      .set(asA(teacherToken))
      .send({ decision: "APPROVE" });
    expect(teacherSelfReview.status).toBe(403);
    const approved = await request(app)
      .post(`/api/v1/remedial/offers/${offer.id}/review`)
      .set(asA(ownerToken))
      .send({ decision: "APPROVE" });
    expect(approved.status).toBe(200);

    // 3. Catalogue public : visible, sans les consignes réservées aux inscrits.
    const catalog = await request(app).get("/api/v1/remedial-portal/catalog");
    const entry = (catalog.body as Record<string, unknown>[]).find((row) => row.id === offer.id);
    expect(entry).toMatchObject({ teacher: "Awa M.", seatsLeft: 2, priceCents: 15_000 });
    expect(entry).not.toHaveProperty("accessDetails");

    // 4. Inscription : refusée à un inconnu, acceptée pour le parent vérifié.
    const strangerEnroll = await request(app)
      .post("/api/v1/remedial-portal/enrollments")
      .set("Authorization", `Bearer ${strangerToken}`)
      .send({ offerId: offer.id, studentId: student.id });
    expect(strangerEnroll.status).toBe(404);

    const enrolled = await request(app)
      .post("/api/v1/remedial-portal/enrollments")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ offerId: offer.id, studentId: student.id });
    expect(enrolled.status).toBe(201);
    const enrollment = enrolled.body as {
      id: string;
      reference: string;
      status: string;
      amountCents: number;
    };
    expect(enrollment).toMatchObject({ status: "PENDING_PAYMENT", amountCents: 15_000 });

    const duplicate = await request(app)
      .post("/api/v1/remedial-portal/enrollments")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ offerId: offer.id, studentId: student.id });
    expect(duplicate.status).toBe(409);

    const before = await request(app)
      .get("/api/v1/remedial-portal/enrollments")
      .set("Authorization", `Bearer ${parentToken}`);
    expect((before.body as { offer: { accessDetails: string | null } }[])[0]?.offer.accessDetails).toBeNull();

    // Sans opérateur branché : aucun moyen en ligne, seulement l'espèce.
    const optionsWithout = await request(app)
      .get(`/api/v1/remedial-portal/enrollments/${enrollment.id}/payment-options`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect(optionsWithout.body).toMatchObject({ providers: [], cash: { reference: enrollment.reference } });

    // 5. Encaissement en espèces par l'établissement de l'enseignant.
    const cash = await request(app)
      .post(`/api/v1/remedial/enrollments/${enrollment.id}/cash-payment`)
      .set(asA(ownerToken));
    expect(cash.status).toBe(201);

    const lines = await testAdminPrisma.remedialPayoutLine.findMany({
      where: { enrollmentId: enrollment.id },
    });
    const byBeneficiary = Object.fromEntries(lines.map((line) => [line.beneficiary, line.amountCents]));
    const platform = Math.floor((15_000 * offer.platformShareBps) / 10_000);
    expect(byBeneficiary).toEqual({ PLATFORM: platform, SCHOOL: 3_000, TEACHER: 15_000 - 3_000 - platform });

    const after = await request(app)
      .get("/api/v1/remedial-portal/enrollments")
      .set("Authorization", `Bearer ${parentToken}`);
    expect((after.body as { status: string; offer: { accessDetails: string | null } }[])[0]).toMatchObject({
      status: "CONFIRMED",
      offer: { accessDetails: offerInput.accessDetails },
    });

    // L'enseignant voit l'inscrit (nom, établissement, contact) — jamais une offre d'un autre enseignant.
    const roster = await request(app)
      .get(`/api/v1/remedial/offers/${offer.id}/enrollments`)
      .set(asA(teacherToken));
    expect(roster.status).toBe(200);
    expect((roster.body as Record<string, unknown>[])[0]).toMatchObject({
      status: "CONFIRMED",
      learnerSchool: schoolB.name,
      contactEmail: parent.email,
    });

    // 6. Paiement en ligne via Konoom (adaptateur branché, webhook signé).
    const secondStudent = await createStudent(schoolB.id, "RC2");
    await createVerifiedRelationship(parent.id, secondStudent.id, schoolB.id);
    const second = await request(app)
      .post("/api/v1/remedial-portal/enrollments")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ offerId: offer.id, studentId: secondStudent.id });
    expect(second.status).toBe(201);
    const secondId = (second.body as { id: string }).id;

    const full = await request(app)
      .post("/api/v1/remedial-portal/enrollments")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ offerId: offer.id, studentId: (await createStudent(schoolB.id, "RC3")).id });
    expect(full.status).toBe(404); // élève sans relation vérifiée

    const initiated: { merchantReference: string }[] = [];
    const adapter = new KonoomPaymentAdapter(
      "KONOOM_CM",
      {
        baseUrl: "https://konoom.test",
        apiKey: "k",
        merchantId: "m",
        webhookSecret: WEBHOOK_SECRET,
        callbackUrl: "https://api.test/api/v1/payments/webhooks/KONOOM_CM",
      },
      ((_url: string, init: RequestInit) => {
        initiated.push(JSON.parse(init.body as string) as { merchantReference: string });
        return Promise.resolve(new Response(JSON.stringify({ transaction_id: "KNM-T1" }), { status: 202 }));
      }) as unknown as typeof fetch,
    );
    registerPaymentProviderAdapter(adapter);

    const options = await request(app)
      .get(`/api/v1/remedial-portal/enrollments/${secondId}/payment-options`)
      .set("Authorization", `Bearer ${parentToken}`);
    expect((options.body as { providers: { code: string }[] }).providers.map((p) => p.code)).toEqual([
      "KONOOM_CM",
    ]);

    const pay = await request(app)
      .post(`/api/v1/remedial-portal/enrollments/${secondId}/pay`)
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ providerCode: "KONOOM_CM", phone: "+237 6 70 00 00 00" });
    expect(pay.status).toBe(202);
    const intent = await testAdminPrisma.paymentIntent.findUniqueOrThrow({
      where: { id: (pay.body as { paymentIntentId: string }).paymentIntentId },
    });
    expect(initiated).toHaveLength(1);

    const webhookBody = JSON.stringify({
      event_id: `evt-rc-${uniqueSuffix()}`,
      transaction_id: `KNM-${uniqueSuffix()}`,
      reference: intent.idempotencyKey,
      status: "SUCCESS",
      amount: 15_000,
    });
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(webhookBody).digest("hex");
    const webhook = await request(app)
      .post("/api/v1/payments/webhooks/KONOOM_CM")
      .set("Content-Type", "application/json")
      .set("x-konoom-signature", signature)
      .send(webhookBody);
    expect(webhook.status).toBeLessThan(300);

    const secondEnrollment = await testAdminPrisma.remedialEnrollment.findUniqueOrThrow({
      where: { id: secondId },
    });
    expect(secondEnrollment.status).toBe("CONFIRMED");
    expect(await testAdminPrisma.remedialPayoutLine.count({ where: { enrollmentId: secondId } })).toBe(3);

    // Offre pleine : plus de place au catalogue.
    const catalogFull = await request(app).get("/api/v1/remedial-portal/catalog");
    expect(
      (catalogFull.body as { id: string; seatsLeft: number }[]).find((row) => row.id === offer.id)?.seatsLeft,
    ).toBe(0);
  });
});
