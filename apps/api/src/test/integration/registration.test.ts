import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma as db } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("inscriptions, tuteur principal et échéancier", () => {
  const app = createApp();
  const tenants: string[] = [];
  const users: string[] = [];
  afterAll(async () => {
    const where = { tenantId: { in: tenants } };
    await db.studentInvoice.deleteMany({ where });
    await db.enrollment.deleteMany({ where });
    await db.student.deleteMany({ where });
    await db.registrationPeriod.deleteMany({ where });
    await db.schoolGuardian.deleteMany({ where });
    await db.classroom.deleteMany({ where });
    await db.gradeLevel.deleteMany({ where });
    await db.educationCycle.deleteMany({ where });
    await db.academicYear.deleteMany({ where });
    await db.campus.deleteMany({ where });
    await db.userRole.deleteMany({ where: { userId: { in: users } } });
    await db.tenantMembership.deleteMany({ where });
    await db.subscription.deleteMany({ where: { owner: { tenantId: { in: tenants } } } });
    await db.subscriptionOwner.deleteMany({ where });
    await db.tenantDomain.deleteMany({ where });
    await db.tenant.deleteMany({ where: { id: { in: tenants } } });
    await db.user.deleteMany({ where: { id: { in: users } } });
  });
  async function setup() {
    const { tenant, subdomain } = await createTenant("Registration");
    tenants.push(tenant.id);
    const owner = await createUser("registration-owner");
    users.push(owner.id);
    await addMembership(owner.id, tenant.id);
    await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);
    const teacher = await createUser("registration-teacher");
    users.push(teacher.id);
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);
    const token = signAccessToken({ sub: owner.id });
    const year = await db.academicYear.create({
      data: {
        tenantId: tenant.id,
        name: "2026-2027",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-07-01"),
      },
    });
    const campus = await db.campus.create({
      data: { tenantId: tenant.id, name: "Principal", code: uniqueSuffix() },
    });
    const cycle = await db.educationCycle.create({
      data: { tenantId: tenant.id, code: uniqueSuffix(), nameFr: "Primaire", nameEn: "Primary", order: 1 },
    });
    const level = await db.gradeLevel.create({
      data: {
        tenantId: tenant.id,
        cycleId: cycle.id,
        code: uniqueSuffix(),
        nameFr: "CP",
        nameEn: "CP",
        order: 1,
      },
    });
    const classroom = await db.classroom.create({
      data: {
        tenantId: tenant.id,
        academicYearId: year.id,
        campusId: campus.id,
        gradeLevelId: level.id,
        name: "CP A",
      },
    });
    const guardian = await db.schoolGuardian.create({
      data: { tenantId: tenant.id, firstName: "Marie", lastName: "Test", phone: "+237600000000" },
    });
    const student = await db.student.create({
      data: {
        tenantId: tenant.id,
        matricule: uniqueSuffix(),
        firstName: "Awa",
        lastName: "Test",
        primaryGuardianId: guardian.id,
      },
    });
    const installments = [1, 2, 3].map((n) => ({
      amountCents: n * 10000,
      dueDate: new Date(Date.now() + n * 86400000).toISOString(),
    }));
    const period = await db.registrationPeriod.create({
      data: {
        tenantId: tenant.id,
        academicYearId: year.id,
        name: "Rentrée",
        startDate: new Date(Date.now() - 86400000),
        endDate: new Date(Date.now() + 86400000),
        installments,
      },
    });
    const input = {
      academicYearId: year.id,
      classroomId: classroom.id,
      campusId: campus.id,
      gradeLevelId: level.id,
      registrationPeriodId: period.id,
    };
    const postEnrollment = (body = input, studentId = student.id) =>
      request(app)
        .post(`/api/v1/students/${studentId}/enrollments`)
        .set("Authorization", `Bearer ${token}`)
        .set("X-Tenant-Slug", subdomain)
        .send(body);
    return {
      tenant,
      subdomain,
      token,
      teacherToken: signAccessToken({ sub: teacher.id }),
      year,
      guardian,
      student,
      period,
      input,
      postEnrollment,
    };
  }
  it("inscrit une seule fois par année même en concurrence, et crée exactement trois factures", async () => {
    const ctx = await setup();
    const responses = await Promise.all([ctx.postEnrollment(), ctx.postEnrollment()]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const invoices = await db.studentInvoice.findMany({
      where: { studentId: ctx.student.id },
      orderBy: { totalCents: "asc" },
    });
    expect(invoices.map((i) => i.totalCents)).toEqual([10000, 20000, 30000]);
    expect(invoices.every((i) => i.status === "ISSUED" && i.academicYearId === ctx.year.id && i.dueAt)).toBe(
      true,
    );
    const second = await db.student.create({
      data: {
        tenantId: ctx.tenant.id,
        primaryGuardianId: ctx.guardian.id,
        matricule: uniqueSuffix(),
        firstName: "Frère",
        lastName: "Test",
      },
    });
    expect((await ctx.postEnrollment(ctx.input, second.id)).status).toBe(201);
    expect(await db.student.count({ where: { primaryGuardianId: ctx.guardian.id } })).toBe(2);
  });
  it("refuse tuteur manquant, période fermée, mauvaise année et mauvais campus sans créer de facture", async () => {
    const ctx = await setup();
    await db.student.update({ where: { id: ctx.student.id }, data: { primaryGuardianId: null } });
    expect((await ctx.postEnrollment()).body).toMatchObject({ code: "PRIMARY_GUARDIAN_REQUIRED" });
    await db.student.update({ where: { id: ctx.student.id }, data: { primaryGuardianId: ctx.guardian.id } });
    await db.registrationPeriod.update({ where: { id: ctx.period.id }, data: { isOpen: false } });
    expect((await ctx.postEnrollment()).body).toMatchObject({ code: "REGISTRATION_PERIOD_CLOSED" });
    await db.registrationPeriod.update({
      where: { id: ctx.period.id },
      data: { isOpen: true, endDate: new Date(Date.now() - 1000) },
    });
    expect((await ctx.postEnrollment()).body).toMatchObject({ code: "REGISTRATION_PERIOD_CLOSED" });
    const otherYear = await db.academicYear.create({
      data: {
        tenantId: ctx.tenant.id,
        name: "2027-2028",
        startDate: new Date("2027-09-01"),
        endDate: new Date("2028-07-01"),
      },
    });
    await db.registrationPeriod.update({
      where: { id: ctx.period.id },
      data: { academicYearId: otherYear.id, endDate: new Date(Date.now() + 86400000) },
    });
    expect((await ctx.postEnrollment()).body).toMatchObject({ code: "REGISTRATION_PERIOD_YEAR_MISMATCH" });
    const otherCampus = await db.campus.create({
      data: { tenantId: ctx.tenant.id, name: "Second", code: uniqueSuffix() },
    });
    expect((await ctx.postEnrollment({ ...ctx.input, campusId: otherCampus.id })).body).toMatchObject({
      code: "CLASSROOM_STRUCTURE_MISMATCH",
    });
    expect(await db.studentInvoice.count({ where: { studentId: ctx.student.id } })).toBe(0);
    expect(await db.enrollment.count({ where: { studentId: ctx.student.id } })).toBe(0);
  });
  it("isole parents/périodes entre établissements, exige les permissions et valide 1 à 3 tranches", async () => {
    const ctx = await setup();
    const other = await setup();
    const headers = { Authorization: `Bearer ${ctx.token}`, "X-Tenant-Slug": ctx.subdomain };
    const invalid = await request(app)
      .patch(`/api/v1/students/${ctx.student.id}`)
      .set(headers)
      .send({ primaryGuardianId: other.guardian.id });
    expect(invalid.status).toBe(404);
    expect((await ctx.postEnrollment({ ...ctx.input, registrationPeriodId: other.period.id })).status).toBe(
      400,
    );
    const denied = await request(app)
      .post("/api/v1/registrations/guardians")
      .set({ ...headers, Authorization: `Bearer ${ctx.teacherToken}` })
      .send({ firstName: "X", lastName: "Y", phone: "1234" });
    expect(denied.status).toBe(403);
    const listed = await request(app).get("/api/v1/registrations/guardians").set(headers);
    expect((listed.body as { id: string }[]).map((g) => g.id)).not.toContain(other.guardian.id);
    for (const count of [0, 4]) {
      const response = await request(app)
        .post("/api/v1/registrations/periods")
        .set(headers)
        .send({
          academicYearId: ctx.year.id,
          name: `Invalid-${count}`,
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString(),
          installments: Array.from({ length: count }, () => ({
            amountCents: 1000,
            dueDate: new Date().toISOString(),
          })),
        });
      expect(response.status).toBe(400);
    }
    const sqlResult = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE edumanage_app");
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ctx.tenant.id}, true)`;
      return tx.schoolGuardian.findMany({ where: { id: other.guardian.id } });
    });
    expect(sqlResult).toEqual([]);
  });
  it("permet de créer/modifier un tuteur et des périodes de 1 à 3 tranches, sans ouvrir le portail", async () => {
    const ctx = await setup();
    const headers = { Authorization: `Bearer ${ctx.token}`, "X-Tenant-Slug": ctx.subdomain };
    const created = await request(app)
      .post("/api/v1/registrations/guardians")
      .set(headers)
      .send({ firstName: "Paul", lastName: "Tuteur", phone: "+237611111111", email: "parent@example.test" });
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;
    const updated = await request(app)
      .patch(`/api/v1/registrations/guardians/${id}`)
      .set(headers)
      .send({ firstName: "Paul", lastName: "Tuteur", phone: "+237622222222" });
    expect(updated.status).toBe(200);
    expect(updated.body as unknown).toMatchObject({ phone: "+237622222222", email: null });
    expect(
      (
        await request(app)
          .patch(`/api/v1/students/${ctx.student.id}`)
          .set(headers)
          .send({ primaryGuardianId: id })
      ).status,
    ).toBe(200);
    expect(await db.parentStudentRelationship.count({ where: { studentId: ctx.student.id } })).toBe(0);
    for (const count of [1, 2, 3]) {
      const payload = {
        academicYearId: ctx.year.id,
        name: `Période-${count}`,
        startDate: new Date(Date.now() - 86400000).toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString(),
        installments: Array.from({ length: count }, (_, index) => ({
          amountCents: (index + 1) * 100,
          dueDate: new Date(Date.now() + (index + 1) * 86400000).toISOString(),
        })),
      };
      const period = await request(app).post("/api/v1/registrations/periods").set(headers).send(payload);
      expect(period.status).toBe(201);
      expect((period.body as { installments: unknown[] }).installments).toHaveLength(count);
      const closed = await request(app)
        .patch(`/api/v1/registrations/periods/${(period.body as { id: string }).id}`)
        .set(headers)
        .send({ isOpen: false });
      expect(closed.status).toBe(200);
      expect(closed.body as unknown).toMatchObject({ isOpen: false });
      expect(
        (await request(app).post("/api/v1/registrations/periods").set(headers).send(payload)).status,
      ).toBe(409);
    }
  });
});
