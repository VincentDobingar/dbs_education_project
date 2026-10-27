import { createHmac } from "node:crypto";

import request from "supertest";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { runFeeCycleForTenant } from "../../modules/finance/fee-schedule/reminders.service.js";
import { KonoomPaymentAdapter } from "../../modules/payments/payment-providers/konoom-provider.js";
import {
  registerPaymentProviderAdapter,
  resetPaymentProviderAdaptersForTests,
} from "../../modules/payments/payment-providers/registry.js";
import { testAdminPrisma as db } from "../admin-client.js";
import {
  addMembership,
  createTenant,
  createUser,
  createVerifiedRelationship,
  grantRole,
  uniqueSuffix,
} from "../fixtures.js";

/** Corps des réponses JSON utilisés par ces scénarios (supertest les type en `any`). */
interface Body {
  id: string;
  code: string;
  status: string;
  mode: string;
  installments: unknown[];
  dues: { kind: string; totalCents: number }[];
  totalCents: number;
  optionalChoices: { feeStructureId: string }[];
  activatedEnrollment: boolean;
  lines: { label: string; amountCents: number }[];
  allocationGroupId: string;
  creditCreatedCents: number;
  outstandingCents: number;
  creditCents: number;
  totals: { recoveryRate: number };
  byTranche: { label: string }[];
  reportCardWithheld: boolean;
  nextDue: unknown;
  providers: unknown[];
  paymentIntentId: string;
}
const body = (res: { body: unknown }): Body => res.body as Body;

const DAY = 86_400_000;
const FCFA = (value: number): number => value * 100;
const iso = (date: Date): string => date.toISOString();

describe("inscription et échéancier flexibles", () => {
  const app = createApp();
  const tenants: string[] = [];
  const users: string[] = [];

  afterEach(() => {
    resetPaymentProviderAdaptersForTests();
  });

  afterAll(async () => {
    const where = { tenantId: { in: tenants } };
    const intents = await db.paymentIntent.findMany({ where, select: { id: true } });
    const intentIds = intents.map((intent) => intent.id);
    await db.receipt.deleteMany({ where: { paymentTransaction: { paymentIntentId: { in: intentIds } } } });
    await db.feeReminderLog.deleteMany({ where });
    await db.studentCredit.deleteMany({ where });
    await db.studentReceipt.deleteMany({ where });
    await db.studentPaymentRefund.deleteMany({ where });
    await db.studentPayment.deleteMany({ where });
    await db.studentInvoice.updateMany({ where, data: { penaltyForInvoiceId: null } });
    await db.studentInvoice.deleteMany({ where });
    await db.paymentTransaction.deleteMany({ where: { paymentIntentId: { in: intentIds } } });
    await db.paymentWebhookEvent.deleteMany({ where: { externalEventId: { startsWith: "evt-ff-" } } });
    await db.paymentIntent.deleteMany({ where: { id: { in: intentIds } } });
    await db.studentFeeDiscount.deleteMany({ where });
    await db.studentFeeAgreement.deleteMany({ where });
    await db.enrollment.deleteMany({ where });
    await db.feePlanInstallment.deleteMany({ where });
    await db.feePlan.deleteMany({ where });
    await db.feeStructure.deleteMany({ where });
    await db.feeCategory.deleteMany({ where });
    await db.feeDiscountPreset.deleteMany({ where });
    await db.tenantSetting.deleteMany({ where });
    await db.notification.deleteMany({ where });
    await db.auditLog.deleteMany({ where });
    await db.parentStudentRelationship.deleteMany({ where });
    await db.student.deleteMany({ where });
    await db.registrationPeriod.deleteMany({ where });
    await db.schoolGuardian.deleteMany({ where });
    await db.classroom.deleteMany({ where });
    await db.gradeLevel.deleteMany({ where });
    await db.educationCycle.deleteMany({ where });
    await db.academicPeriod.deleteMany({ where });
    await db.academicYear.deleteMany({ where });
    await db.campus.deleteMany({ where });
    await db.employee.deleteMany({ where });
    await db.userRole.deleteMany({ where: { userId: { in: users } } });
    await db.tenantMembership.deleteMany({ where });
    await db.subscription.deleteMany({ where: { owner: { tenantId: { in: tenants } } } });
    await db.subscriptionOwner.deleteMany({ where });
    await db.tenantDomain.deleteMany({ where });
    await db.tenant.deleteMany({ where: { id: { in: tenants } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  });

  async function setup() {
    const { tenant, subdomain } = await createTenant("FlexFees");
    tenants.push(tenant.id);
    const owner = await createUser("ff-owner");
    const secretary = await createUser("ff-secretary");
    const parent = await createUser("ff-parent");
    users.push(owner.id, secretary.id, parent.id);
    await addMembership(owner.id, tenant.id);
    await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);
    await addMembership(secretary.id, tenant.id);
    await grantRole(secretary.id, "SECRETARY", tenant.id);
    await db.employee.create({
      data: {
        tenantId: tenant.id,
        userId: owner.id,
        employeeNumber: `E-${uniqueSuffix()}`,
        firstName: "Éco",
        lastName: "Nome",
        jobTitle: "Économe",
      },
    });
    const now = Date.now();
    const year = await db.academicYear.create({
      data: {
        tenantId: tenant.id,
        name: "2026-2027",
        startDate: new Date(now - 30 * DAY),
        endDate: new Date(now + 280 * DAY),
        isCurrent: true,
      },
    });
    const periodRows = await Promise.all(
      [
        [1, -30, 59],
        [2, 60, 149],
        [3, 150, 260],
      ].map(([sequence, start, end]) =>
        db.academicPeriod.create({
          data: {
            tenantId: tenant.id,
            academicYearId: year.id,
            name: `Trimestre ${sequence}`,
            type: "TRIMESTER",
            sequence: sequence!,
            startDate: new Date(now + start! * DAY),
            endDate: new Date(now + end! * DAY),
          },
        }),
      ),
    );
    const [t1, t2, t3] = [periodRows[0]!, periodRows[1]!, periodRows[2]!];
    const campus = await db.campus.create({
      data: { tenantId: tenant.id, name: "Principal", code: uniqueSuffix() },
    });
    const cycle = await db.educationCycle.create({
      data: { tenantId: tenant.id, code: uniqueSuffix(), nameFr: "Lycée", nameEn: "High school", order: 3 },
    });
    const level = await db.gradeLevel.create({
      data: {
        tenantId: tenant.id,
        cycleId: cycle.id,
        code: uniqueSuffix(),
        nameFr: "Terminale",
        nameEn: "Final year",
        order: 7,
      },
    });
    const classroom = await db.classroom.create({
      data: {
        tenantId: tenant.id,
        academicYearId: year.id,
        campusId: campus.id,
        gradeLevelId: level.id,
        name: "Tle C",
      },
    });
    const guardian = await db.schoolGuardian.create({
      data: { tenantId: tenant.id, firstName: "Mariam", lastName: "Test", phone: "+23566000000" },
    });
    const student = await db.student.create({
      data: {
        tenantId: tenant.id,
        matricule: uniqueSuffix(),
        firstName: "Idriss",
        lastName: "Test",
        primaryGuardianId: guardian.id,
        status: "PROSPECTIVE",
      },
    });
    await createVerifiedRelationship(parent.id, student.id, tenant.id);
    const period = await db.registrationPeriod.create({
      data: {
        tenantId: tenant.id,
        academicYearId: year.id,
        name: "Rentrée",
        startDate: new Date(now - DAY),
        endDate: new Date(now + 30 * DAY),
        installments: [],
      },
    });
    const headers = (userId: string) => ({
      Authorization: `Bearer ${signAccessToken({ sub: userId })}`,
      "X-Tenant-Slug": subdomain,
    });
    return {
      tenant,
      subdomain,
      owner,
      secretary,
      parent,
      year,
      periods: { t1, t2, t3 },
      campus,
      level,
      classroom,
      student,
      period,
      headers,
    };
  }

  it("paramétrage, aperçu, inscription admise puis activée au paiement, répartition, avoir, exceptions, relances, retrait", async () => {
    const ctx = await setup();
    const asOwner = ctx.headers(ctx.owner.id);
    const asSecretary = ctx.headers(ctx.secretary.id);

    // 1. Rubriques typées et grille par niveau et profil.
    const category = async (code: string, nature: string, nameFr: string) => {
      const res = await request(app)
        .post("/api/v1/finance/fee-categories")
        .set(asOwner)
        .send({ code, nameFr, nameEn: nameFr, nature });
      expect(res.status).toBe(201);
      return res.body as { id: string; isRefundable: boolean };
    };
    const ins = await category("INS", "REGISTRATION", "Frais d'inscription");
    expect(ins.isRefundable).toBe(false);
    const sco = await category("SCO", "TUITION", "Scolarité");
    const bac = await category("BAC", "EXAM", "Frais d'examen Bac");
    const can = await category("CAN", "ANNEX", "Cantine");
    const fee = async (body: Record<string, unknown>) => {
      const res = await request(app)
        .post("/api/v1/finance/fee-structures")
        .set(asOwner)
        .send({ academicYearId: ctx.year.id, ...body });
      expect(res.status).toBe(201);
      return res.body as { id: string };
    };
    await fee({ feeCategoryId: ins.id, amountCents: FCFA(25_000), studentType: "NEW" });
    await fee({ feeCategoryId: ins.id, amountCents: FCFA(15_000), studentType: "RETURNING" });
    await fee({ feeCategoryId: sco.id, amountCents: FCFA(150_000), gradeLevelId: ctx.level.id });
    await fee({
      feeCategoryId: bac.id,
      amountCents: FCFA(25_000),
      gradeLevelId: ctx.level.id,
      dueWithInstallment: 3,
    });
    const canteen = await fee({
      feeCategoryId: can.id,
      amountCents: FCFA(30_000),
      isMandatory: false,
      dueWithInstallment: 1,
    });

    // 2. Plan d'échéances ancré sur les trimestres ; un plan à 90 % est refusé.
    const planBody = {
      academicYearId: ctx.year.id,
      name: "Plan trimestriel",
      installments: [
        { label: "Tranche 1", shareBps: 4000, anchorType: "ENROLLMENT", offsetDays: 0 },
        {
          label: "Tranche 2",
          shareBps: 3500,
          anchorType: "PERIOD_START",
          academicPeriodId: ctx.periods.t2.id,
          offsetDays: 15,
        },
        {
          label: "Tranche 3",
          shareBps: 2500,
          anchorType: "PERIOD_START",
          academicPeriodId: ctx.periods.t3.id,
          offsetDays: 0,
        },
      ],
    };
    const badPlan = await request(app)
      .post("/api/v1/finance/fee-plans")
      .set(asOwner)
      .send({ ...planBody, installments: planBody.installments.map((i) => ({ ...i, shareBps: 3000 })) });
    expect(badPlan.status).toBe(400);
    expect(body(badPlan).code).toBe("PLAN_SHARES_NOT_100");
    const plan = await request(app).post("/api/v1/finance/fee-plans").set(asOwner).send(planBody);
    expect(plan.status).toBe(201);
    expect(body(plan).installments).toHaveLength(3);
    const preset = await request(app)
      .post("/api/v1/finance/discount-presets")
      .set(asOwner)
      .send({ name: "Fratrie", kind: "PERCENT", value: 1000 });
    expect(preset.status).toBe(201);

    // 3. Aperçu : inscription à part, scolarité remisée et découpée, cantine et examen sur leur tranche.
    const enrollment = {
      academicYearId: ctx.year.id,
      classroomId: ctx.classroom.id,
      campusId: ctx.campus.id,
      gradeLevelId: ctx.level.id,
      registrationPeriodId: ctx.period.id,
      optionalFeeStructureIds: [canteen.id],
      discountPresetIds: [body(preset).id],
    };
    const preview = await request(app)
      .post(`/api/v1/students/${ctx.student.id}/enrollments/preview`)
      .set(asSecretary)
      .send(enrollment);
    expect(preview.status).toBe(200);
    expect(body(preview).mode).toBe("PLAN");
    expect(
      body(preview).dues.map((due: { kind: string; totalCents: number }) => [due.kind, due.totalCents]),
    ).toEqual([
      ["REGISTRATION", FCFA(25_000)],
      ["INSTALLMENT", FCFA(54_000 + 30_000)],
      ["INSTALLMENT", FCFA(47_250)],
      ["INSTALLMENT", FCFA(33_750 + 25_000)],
    ]);
    expect(body(preview).totalCents).toBe(FCFA(215_000));
    expect(
      body(preview).optionalChoices.map((choice: { feeStructureId: string }) => choice.feeStructureId),
    ).toEqual([canteen.id]);

    // 4. Une remise au cas par cas est réservée à la direction.
    const manual = await request(app)
      .post(`/api/v1/students/${ctx.student.id}/enrollments`)
      .set(asSecretary)
      .send({
        ...enrollment,
        manualDiscounts: [
          { label: "Cas social", kind: "AMOUNT", value: FCFA(10_000), reason: "Famille sinistrée" },
        ],
      });
    expect(manual.status).toBe(403);
    expect(body(manual).code).toBe("MANUAL_DISCOUNT_NOT_ALLOWED");

    // 5. Inscription : admis, pas encore dans la classe tant que l'inscription n'est pas payée.
    const created = await request(app)
      .post(`/api/v1/students/${ctx.student.id}/enrollments`)
      .set(asSecretary)
      .send(enrollment);
    expect(created.status).toBe(201);
    expect(body(created).status).toBe("ADMITTED");
    const roster = await request(app).get(`/api/v1/students?classroomId=${ctx.classroom.id}`).set(asOwner);
    expect(roster.status).toBe(200);
    expect(JSON.stringify(body(roster))).not.toContain(ctx.student.id);
    const agreement = await db.studentFeeAgreement.findUniqueOrThrow({
      where: { enrollmentId: body(created).id },
      include: { discounts: true },
    });
    expect(agreement.totalCents).toBe(FCFA(215_000));
    expect(agreement.discounts[0]).toMatchObject({ label: "Fratrie", amountCents: FCFA(15_000) });
    const invoices = await db.studentInvoice.findMany({
      where: { agreementId: agreement.id },
      orderBy: [{ dueAt: "asc" }, { kind: "asc" }],
    });
    expect(invoices.map((invoice) => invoice.kind).sort()).toEqual([
      "INSTALLMENT",
      "INSTALLMENT",
      "INSTALLMENT",
      "REGISTRATION",
    ]);

    // 6. Versement de 30 000 : l'inscription d'abord (activation), puis la tranche 1.
    const pay1 = await request(app)
      .post(`/api/v1/finance/students/${ctx.student.id}/payments`)
      .set(asOwner)
      .send({ amountCents: FCFA(30_000) });
    expect(pay1.status).toBe(201);
    expect(body(pay1).activatedEnrollment).toBe(true);
    expect(
      body(pay1).lines.map((line: { label: string; amountCents: number }) => [line.label, line.amountCents]),
    ).toEqual([
      ["Inscription", FCFA(25_000)],
      ["Tranche 1", FCFA(5_000)],
    ]);
    const active = await db.enrollment.findUniqueOrThrow({ where: { id: body(created).id } });
    expect(active.status).toBe("ENROLLED");
    expect((await db.student.findUniqueOrThrow({ where: { id: ctx.student.id } })).status).toBe("ACTIVE");
    const rosterAfter = await request(app)
      .get(`/api/v1/students?classroomId=${ctx.classroom.id}`)
      .set(asOwner);
    expect(JSON.stringify(body(rosterAfter))).toContain(ctx.student.id);
    const pdf = await request(app)
      .get(`/api/v1/finance/payment-groups/${body(pay1).allocationGroupId}/pdf`)
      .set(asOwner);
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toContain("application/pdf");

    // 7. Échéancier individuel : découpage de la tranche 3, report de la tranche 2 (tracés).
    const t3 = invoices.find((invoice) => invoice.installmentSequence === 3)!;
    const t2 = invoices.find((invoice) => invoice.installmentSequence === 2)!;
    const badSplit = await request(app)
      .post(`/api/v1/finance/student-invoices/${t3.id}/split`)
      .set(asOwner)
      .send({
        parts: [
          { amountCents: FCFA(30_000), dueAt: iso(new Date(Date.now() + 160 * DAY)) },
          { amountCents: FCFA(1), dueAt: iso(new Date(Date.now() + 190 * DAY)) },
        ],
        reason: "Demande de la famille",
      });
    expect(badSplit.status).toBe(400);
    const split = await request(app)
      .post(`/api/v1/finance/student-invoices/${t3.id}/split`)
      .set(asOwner)
      .send({
        parts: [
          { amountCents: FCFA(30_000), dueAt: iso(new Date(Date.now() + 160 * DAY)) },
          { amountCents: FCFA(28_750), dueAt: iso(new Date(Date.now() + 190 * DAY)) },
        ],
        reason: "Demande de la famille",
      });
    expect(split.status).toBe(201);
    const moved = await request(app)
      .post(`/api/v1/finance/student-invoices/${t2.id}/reschedule`)
      .set(asOwner)
      .send({ dueAt: iso(new Date(Date.now() + 100 * DAY)), reason: "Report accordé" });
    expect(moved.status).toBe(200);
    expect(
      await db.auditLog.count({
        where: {
          tenantId: ctx.tenant.id,
          action: { in: ["student_invoice.split", "student_invoice.reschedule"] },
        },
      }),
    ).toBe(2);

    // 8. Trop-perçu : un versement supérieur au reste dû devient un avoir.
    const pay2 = await request(app)
      .post(`/api/v1/finance/students/${ctx.student.id}/payments`)
      .set(asOwner)
      .send({ amountCents: FCFA(200_000) });
    expect(pay2.status).toBe(201);
    expect(body(pay2).creditCreatedCents).toBe(FCFA(15_000));
    const schedule = await request(app)
      .get(`/api/v1/finance/students/${ctx.student.id}/schedule`)
      .set(asOwner);
    expect(body(schedule).outstandingCents).toBe(0);
    expect(body(schedule).creditCents).toBe(FCFA(15_000));

    // 9. Recouvrement : tout est payé.
    const recovery = await request(app)
      .get(`/api/v1/finance/recovery?academicYearId=${ctx.year.id}`)
      .set(asOwner);
    expect(recovery.status).toBe(200);
    expect(body(recovery).totals.recoveryRate).toBe(100);
    expect(body(recovery).byTranche[0]?.label).toBe("Inscription");
  });

  it("retenue du bulletin, relances et pénalité uniques, blocage des arriérés, retrait", async () => {
    const ctx = await setup();
    const asOwner = ctx.headers(ctx.owner.id);
    const policy = {
      midYearPolicy: "GROUP",
      reenrollmentWithArrears: "BLOCK",
      withholdReportCards: true,
      withholdAfterDays: 0,
      remindersEnabled: true,
      reminderDaysBefore: 3,
      reminderDaysAfter: 1,
      longOverdueDays: 15,
      penaltyEnabled: true,
      penaltyKind: "AMOUNT",
      penaltyValue: FCFA(2_000),
      penaltyAfterDays: 2,
      onlinePaymentEnabled: false,
    };
    expect((await request(app).put("/api/v1/finance/fee-policy").set(asOwner).send(policy)).status).toBe(200);
    const sco = await request(app)
      .post("/api/v1/finance/fee-categories")
      .set(asOwner)
      .send({ code: "SCO", nameFr: "Scolarité", nameEn: "Tuition", nature: "TUITION" });
    await request(app)
      .post("/api/v1/finance/fee-structures")
      .set(asOwner)
      .send({ academicYearId: ctx.year.id, feeCategoryId: body(sco).id, amountCents: FCFA(90_000) });
    await request(app)
      .post("/api/v1/finance/fee-plans")
      .set(asOwner)
      .send({
        academicYearId: ctx.year.id,
        name: "Semestriel",
        installments: [
          {
            label: "Semestre 1",
            shareBps: 5000,
            anchorType: "PERIOD_START",
            academicPeriodId: ctx.periods.t1.id,
            offsetDays: 0,
          },
          {
            label: "Semestre 2",
            shareBps: 5000,
            anchorType: "PERIOD_START",
            academicPeriodId: ctx.periods.t3.id,
            offsetDays: 0,
          },
        ],
      });

    // Inscription en cours d'année (GROUP) : sans frais d'inscription, l'élève est inscrit d'emblée.
    const created = await request(app)
      .post(`/api/v1/students/${ctx.student.id}/enrollments`)
      .set(asOwner)
      .send({
        academicYearId: ctx.year.id,
        classroomId: ctx.classroom.id,
        campusId: ctx.campus.id,
        gradeLevelId: ctx.level.id,
        registrationPeriodId: ctx.period.id,
      });
    expect(created.status).toBe(201);
    expect(body(created).status).toBe("ENROLLED");
    const invoices = await db.studentInvoice.findMany({
      where: { studentId: ctx.student.id },
      orderBy: { dueAt: "asc" },
    });
    expect(invoices.map((invoice) => invoice.totalCents)).toEqual([FCFA(45_000), FCFA(45_000)]);
    // Le semestre 1 avait commencé : son échéance est ramenée au jour de l'inscription.
    expect(invoices[0]!.dueAt!.getTime()).toBeGreaterThan(Date.now() - 2 * DAY);

    // Retenue du bulletin dès qu'une échéance est en retard.
    await db.studentInvoice.update({
      where: { id: invoices[0]!.id },
      data: { dueAt: new Date(Date.now() - 3 * DAY) },
    });
    const family = await request(app)
      .get(`/api/v1/parent-portal/children/${ctx.student.id}/fee-schedule`)
      .set("Authorization", `Bearer ${signAccessToken({ sub: ctx.parent.id })}`);
    expect(family.status).toBe(200);
    expect(body(family).reportCardWithheld).toBe(true);
    expect(body(family).nextDue).toMatchObject({ amountCents: FCFA(45_000) });

    // Relances et pénalité : une seule fois par échéance.
    const first = await runFeeCycleForTenant(ctx.tenant.id);
    expect(first.penalties).toBe(1);
    expect(first.reminders).toBeGreaterThanOrEqual(1);
    const second = await runFeeCycleForTenant(ctx.tenant.id);
    expect(second).toMatchObject({ penalties: 0, reminders: 0 });
    const penalty = await db.studentInvoice.findFirstOrThrow({
      where: { penaltyForInvoiceId: invoices[0]!.id },
    });
    expect(penalty).toMatchObject({ kind: "PENALTY", totalCents: FCFA(2_000) });

    // Arriérés bloquants pour la réinscription l'année suivante.
    const nextYear = await db.academicYear.create({
      data: {
        tenantId: ctx.tenant.id,
        name: "2027-2028",
        startDate: new Date(Date.now() + 300 * DAY),
        endDate: new Date(Date.now() + 600 * DAY),
      },
    });
    const nextClass = await db.classroom.create({
      data: {
        tenantId: ctx.tenant.id,
        academicYearId: nextYear.id,
        campusId: ctx.campus.id,
        gradeLevelId: ctx.level.id,
        name: "Tle C 2027",
      },
    });
    const nextPeriod = await db.registrationPeriod.create({
      data: {
        tenantId: ctx.tenant.id,
        academicYearId: nextYear.id,
        name: "Réinscriptions",
        startDate: new Date(Date.now() - DAY),
        endDate: new Date(Date.now() + DAY),
        installments: [],
      },
    });
    await db.feePlan.create({
      data: {
        tenantId: ctx.tenant.id,
        academicYearId: nextYear.id,
        name: "Annuel",
        installments: {
          create: {
            tenantId: ctx.tenant.id,
            sequence: 1,
            label: "Annuel",
            shareBps: 10_000,
            anchorType: "ENROLLMENT",
          },
        },
      },
    });
    const blocked = await request(app)
      .post(`/api/v1/students/${ctx.student.id}/enrollments`)
      .set(asOwner)
      .send({
        academicYearId: nextYear.id,
        classroomId: nextClass.id,
        campusId: ctx.campus.id,
        gradeLevelId: ctx.level.id,
        registrationPeriodId: nextPeriod.id,
      });
    expect(blocked.status).toBe(409);
    expect(body(blocked).code).toBe("ENROLLMENT_ARREARS_OUTSTANDING");

    // Retrait : l'échéance future non entamée est annulée.
    const withdrawn = await request(app)
      .patch(`/api/v1/students/${ctx.student.id}/enrollments/${body(created).id}`)
      .set(asOwner)
      .send({ status: "WITHDRAWN" });
    expect(withdrawn.status).toBe(200);
    const future = await db.studentInvoice.findUniqueOrThrow({ where: { id: invoices[1]!.id } });
    expect(future.status).toBe("CANCELLED");
    const pastDue = await db.studentInvoice.findUniqueOrThrow({ where: { id: invoices[0]!.id } });
    expect(pastDue.status).toBe("ISSUED");
  });

  it("paiement en ligne d'une échéance par le parent (Konoom), activation et reversement DBSA", async () => {
    const ctx = await setup();
    const asOwner = ctx.headers(ctx.owner.id);
    const parentHeaders = { Authorization: `Bearer ${signAccessToken({ sub: ctx.parent.id })}` };
    const ins = await request(app)
      .post("/api/v1/finance/fee-categories")
      .set(asOwner)
      .send({ code: "INS", nameFr: "Inscription", nameEn: "Registration", nature: "REGISTRATION" });
    await request(app)
      .post("/api/v1/finance/fee-structures")
      .set(asOwner)
      .send({ academicYearId: ctx.year.id, feeCategoryId: body(ins).id, amountCents: FCFA(10_000) });
    await request(app)
      .post("/api/v1/finance/fee-plans")
      .set(asOwner)
      .send({
        academicYearId: ctx.year.id,
        name: "Annuel",
        installments: [{ label: "Année", shareBps: 10_000, anchorType: "ENROLLMENT", offsetDays: 0 }],
      });
    const created = await request(app)
      .post(`/api/v1/students/${ctx.student.id}/enrollments`)
      .set(asOwner)
      .send({
        academicYearId: ctx.year.id,
        classroomId: ctx.classroom.id,
        campusId: ctx.campus.id,
        gradeLevelId: ctx.level.id,
        registrationPeriodId: ctx.period.id,
      });
    expect(body(created).status).toBe("ADMITTED");
    const registration = await db.studentInvoice.findFirstOrThrow({
      where: { studentId: ctx.student.id, kind: "REGISTRATION" },
    });

    // Paiement en ligne désactivé par défaut : seule la caisse est proposée.
    const closed = await request(app)
      .get(`/api/v1/parent-portal/children/${ctx.student.id}/fee-schedule/${registration.id}/payment-options`)
      .set(parentHeaders);
    expect(closed.status).toBe(200);
    expect(body(closed).providers).toEqual([]);

    const policy = await request(app).get("/api/v1/finance/fee-policy").set(asOwner);
    await request(app)
      .put("/api/v1/finance/fee-policy")
      .set(asOwner)
      .send({ ...body(policy), onlinePaymentEnabled: true });
    const secret = "whsec_fees";
    registerPaymentProviderAdapter(
      new KonoomPaymentAdapter(
        "KONOOM_CM",
        {
          baseUrl: "https://konoom.test",
          apiKey: "k",
          merchantId: "m",
          webhookSecret: secret,
          callbackUrl: "https://api.test/api/v1/payments/webhooks/KONOOM_CM",
        },
        () => Promise.resolve(new Response(JSON.stringify({ transaction_id: "KNM-F1" }), { status: 202 })),
      ),
    );
    const pay = await request(app)
      .post(`/api/v1/parent-portal/children/${ctx.student.id}/fee-schedule/${registration.id}/pay`)
      .set(parentHeaders)
      .send({ providerCode: "KONOOM_CM", phone: "+237 6 70 00 00 00" });
    expect(pay.status).toBe(201);
    const intent = await db.paymentIntent.findUniqueOrThrow({ where: { id: body(pay).paymentIntentId } });
    // Intention en unités de la devise (XAF, 0 décimale) : 10 000 FCFA.
    expect(intent).toMatchObject({ purpose: "STUDENT_FEE", tenantId: ctx.tenant.id, amountCents: 10_000 });

    const webhookBody = JSON.stringify({
      event_id: `evt-ff-${uniqueSuffix()}`,
      transaction_id: `KNM-${uniqueSuffix()}`,
      reference: intent.idempotencyKey,
      status: "SUCCESS",
      amount: 10_000,
    });
    const send = () =>
      request(app)
        .post("/api/v1/payments/webhooks/KONOOM_CM")
        .set("Content-Type", "application/json")
        .set("x-konoom-signature", createHmac("sha256", secret).update(webhookBody).digest("hex"))
        .send(webhookBody);
    expect((await send()).status).toBeLessThan(300);
    expect((await send()).status).toBeLessThan(300); // rejoué : sans double encaissement
    const paid = await db.studentInvoice.findUniqueOrThrow({ where: { id: registration.id } });
    expect(paid).toMatchObject({ status: "PAID", paidCents: FCFA(10_000) });
    expect(await db.studentPayment.count({ where: { studentInvoiceId: registration.id } })).toBe(1);
    expect((await db.enrollment.findUniqueOrThrow({ where: { id: body(created).id } })).status).toBe(
      "ENROLLED",
    );
    const status = await request(app)
      .get(
        `/api/v1/parent-portal/children/${ctx.student.id}/fee-schedule/${registration.id}/payments/${intent.id}`,
      )
      .set(parentHeaders);
    expect(body(status)).toMatchObject({ paymentStatus: "SUCCEEDED", invoiceStatus: "PAID" });

    // Reversement à l'établissement, côté SuperAdmin.
    const admin = await createUser("ff-admin");
    users.push(admin.id);
    await grantRole(admin.id, "SUPER_ADMIN", null);
    const adminHeaders = { Authorization: `Bearer ${signAccessToken({ sub: admin.id })}` };
    const settlements = await request(app).get("/api/v1/platform/fee-settlements").set(adminHeaders);
    expect(settlements.status).toBe(200);
    expect(
      (settlements.body as { tenantId: string; pendingCents: number }[]).find(
        (row) => row.tenantId === ctx.tenant.id,
      )?.pendingCents,
    ).toBe(FCFA(10_000));
    const settle = await request(app)
      .post(`/api/v1/platform/fee-settlements/${ctx.tenant.id}/mark-paid`)
      .set(adminHeaders)
      .send({ reference: "VIR-001", justification: "Reversement mensuel" });
    expect(settle.status).toBe(200);
    expect(body(settle)).toMatchObject({ count: 1, amountCents: FCFA(10_000) });
  });
});
