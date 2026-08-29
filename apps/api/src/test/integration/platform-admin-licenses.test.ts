import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { createStudent, createSubscription, createTenant, createUser, grantRole } from "../fixtures.js";

describe("super-administration — licences sponsorisées (§31 tranche 7)", () => {
  const app = createApp();
  const createdUserIds: string[] = [];
  const createdTenantIds: string[] = [];
  const createdOrganizationIds: string[] = [];
  const createdBatchIds: string[] = [];
  const createdStudentIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.auditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
    await testAdminPrisma.licenseAssignment.deleteMany({
      where: { license: { batchId: { in: createdBatchIds } } },
    });
    await testAdminPrisma.sponsoredLicense.deleteMany({ where: { batchId: { in: createdBatchIds } } });
    await testAdminPrisma.licenseBatch.deleteMany({ where: { id: { in: createdBatchIds } } });
    await testAdminPrisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    // Abonnements créés par assignLicense elle-même (bénéficiaire STUDENT, sans
    // subscriptionId fourni) — rattachés à un SubscriptionOwner.studentId, jamais
    // .tenantId, donc pas couverts par le nettoyage tenant ci-dessous.
    await testAdminPrisma.entitlement.deleteMany({
      where: { subscription: { owner: { studentId: { in: createdStudentIds } } } },
    });
    await testAdminPrisma.subscriptionEvent.deleteMany({
      where: { subscription: { owner: { studentId: { in: createdStudentIds } } } },
    });
    await testAdminPrisma.subscription.deleteMany({
      where: { owner: { studentId: { in: createdStudentIds } } },
    });
    await testAdminPrisma.subscriptionOwner.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await testAdminPrisma.subscription.deleteMany({
      where: { owner: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.subscriptionOwner.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { userId: { in: createdUserIds }, tenantId: null } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  it("achat de lot, émission des licences, attribution, révocation — moindre privilège respecté", async () => {
    const { tenant } = await createTenant("LicenseSponsorTenant", { activeSubscription: false });
    createdTenantIds.push(tenant.id);
    const subscription = await createSubscription({ tenantId: tenant.id }, "SCHOOL", "SCHOOL_ESSENTIAL");

    const parentBeneficiary = await createUser("license-beneficiary");
    createdUserIds.push(parentBeneficiary.id);

    const plan = await testAdminPrisma.subscriptionPlan.findUniqueOrThrow({
      where: { code: "SCHOOL_ESSENTIAL" },
    });
    const currency = await testAdminPrisma.currency.findUniqueOrThrow({ where: { isoCode: "XAF" } });

    const superAdmin = await createUser("license-super");
    createdUserIds.push(superAdmin.id);
    await grantRole(superAdmin.id, "SUPER_ADMIN", null);
    const superAdminToken = signAccessToken({ sub: superAdmin.id });

    const auditor = await createUser("license-auditor");
    createdUserIds.push(auditor.id);
    await grantRole(auditor.id, "PLATFORM_AUDITOR", null);
    const auditorToken = signAccessToken({ sub: auditor.id });

    const inconsistentPurchaser = await request(app)
      .post("/api/v1/platform/license-batches")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        planId: plan.id,
        purchaserType: "TENANT",
        sponsorOrganizationId: "does-not-matter",
        quantity: 3,
        unitPriceCents: 1000,
        currencyId: currency.id,
      });
    expect(inconsistentPurchaser.status).toBe(400);

    const createBatchDeniedForAuditor = await request(app)
      .post("/api/v1/platform/license-batches")
      .set("Authorization", `Bearer ${auditorToken}`)
      .send({
        planId: plan.id,
        purchaserType: "TENANT",
        sponsorTenantId: tenant.id,
        quantity: 3,
        unitPriceCents: 1000,
        currencyId: currency.id,
      });
    expect(createBatchDeniedForAuditor.status).toBe(403);

    const createdBatch = await request(app)
      .post("/api/v1/platform/license-batches")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        planId: plan.id,
        purchaserType: "TENANT",
        sponsorTenantId: tenant.id,
        quantity: 3,
        unitPriceCents: 1000,
        currencyId: currency.id,
      });
    expect(createdBatch.status).toBe(201);
    const batchId = (createdBatch.body as { id: string }).id;
    createdBatchIds.push(batchId);
    const issuedLicenses = (createdBatch.body as { licenses: { id: string; status: string }[] }).licenses;
    expect(issuedLicenses.length).toBe(3);
    expect(issuedLicenses.every((license) => license.status === "AVAILABLE")).toBe(true);
    const licenseId = issuedLicenses[0]?.id as string;

    const organization = await testAdminPrisma.organization.create({
      data: { name: "Org Sponsor Test", type: "COMPANY" },
    });
    createdOrganizationIds.push(organization.id);

    const createdOrgBatch = await request(app)
      .post("/api/v1/platform/license-batches")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        planId: plan.id,
        purchaserType: "ORGANIZATION",
        sponsorOrganizationId: organization.id,
        quantity: 2,
        unitPriceCents: 500,
        currencyId: currency.id,
      });
    expect(createdOrgBatch.status).toBe(201);
    createdBatchIds.push((createdOrgBatch.body as { id: string }).id);
    expect((createdOrgBatch.body as { licenses: unknown[] }).licenses.length).toBe(2);

    const assignDeniedForAuditor = await request(app)
      .post(`/api/v1/platform/licenses/${licenseId}/assign`)
      .set("Authorization", `Bearer ${auditorToken}`)
      .send({
        beneficiaryType: "PARENT",
        beneficiaryUserId: parentBeneficiary.id,
        subscriptionId: subscription.id,
      });
    expect(assignDeniedForAuditor.status).toBe(403);

    const assigned = await request(app)
      .post(`/api/v1/platform/licenses/${licenseId}/assign`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        beneficiaryType: "PARENT",
        beneficiaryUserId: parentBeneficiary.id,
        subscriptionId: subscription.id,
      });
    expect(assigned.status).toBe(200);
    expect((assigned.body as { status: string }).status).toBe("ASSIGNED");

    const doubleAssign = await request(app)
      .post(`/api/v1/platform/licenses/${licenseId}/assign`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        beneficiaryType: "PARENT",
        beneficiaryUserId: parentBeneficiary.id,
        subscriptionId: subscription.id,
      });
    expect(doubleAssign.status).toBe(409);
    expect((doubleAssign.body as { code: string }).code).toBe("LICENSE_NOT_AVAILABLE");

    const detail = await request(app)
      .get(`/api/v1/platform/licenses/${licenseId}`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(detail.status).toBe(200);
    expect((detail.body as { assignments: unknown[] }).assignments.length).toBe(1);

    const revoked = await request(app)
      .post(`/api/v1/platform/licenses/${licenseId}/revoke`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ reason: "Sponsor a retiré son financement" });
    expect(revoked.status).toBe(200);
    expect((revoked.body as { status: string }).status).toBe("REVOKED");

    const revokeAgain = await request(app)
      .post(`/api/v1/platform/licenses/${licenseId}/revoke`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({});
    expect(revokeAgain.status).toBe(409);
    expect((revokeAgain.body as { code: string }).code).toBe("LICENSE_ALREADY_REVOKED");

    const detailAfterRevoke = await request(app)
      .get(`/api/v1/platform/licenses/${licenseId}`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(
      (detailAfterRevoke.body as { assignments: { revokedAt: string | null }[] }).assignments[0]?.revokedAt,
    ).not.toBeNull();

    const auditLogs = await request(app)
      .get(`/api/v1/platform/audit-logs?entityType=SponsoredLicense`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(auditLogs.status).toBe(200);
    const actions = (auditLogs.body as { action: string; entityId: string }[])
      .filter((log) => log.entityId === licenseId)
      .map((log) => log.action);
    expect(actions).toContain("license.assign");
    expect(actions).toContain("license.revoke");

    const batchAuditLogs = await request(app)
      .get(`/api/v1/platform/audit-logs?entityType=LicenseBatch`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    const batchActions = (batchAuditLogs.body as { action: string; entityId: string }[])
      .filter((log) => log.entityId === batchId)
      .map((log) => log.action);
    expect(batchActions).toContain("license_batch.create");
  }, 20000);

  it("attribue une licence sans subscriptionId : crée et active l'abonnement du bénéficiaire", async () => {
    const { tenant } = await createTenant("LicenseNewSubTenant", { activeSubscription: false });
    createdTenantIds.push(tenant.id);

    const superAdmin = await createUser("license-new-sub-super");
    createdUserIds.push(superAdmin.id);
    await grantRole(superAdmin.id, "SUPER_ADMIN", null);
    const superAdminToken = signAccessToken({ sub: superAdmin.id });

    const studentPlan = await testAdminPrisma.subscriptionPlan.findUniqueOrThrow({
      where: { code: "STUDENT_BASIC" },
    });
    const currency = await testAdminPrisma.currency.findUniqueOrThrow({ where: { isoCode: "XAF" } });
    const studentBeneficiary = await createStudent(tenant.id, "LICSTU");
    createdStudentIds.push(studentBeneficiary.id);

    const missingBillingPeriod = await request(app)
      .post("/api/v1/platform/license-batches")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        planId: studentPlan.id,
        purchaserType: "TENANT",
        sponsorTenantId: tenant.id,
        quantity: 1,
        unitPriceCents: 500,
        currencyId: currency.id,
      });
    expect(missingBillingPeriod.status).toBe(201);
    const batchId = (missingBillingPeriod.body as { id: string }).id;
    createdBatchIds.push(batchId);
    const licenseId = (missingBillingPeriod.body as { licenses: { id: string }[] }).licenses[0]?.id as string;

    const missingBillingPeriodAssign = await request(app)
      .post(`/api/v1/platform/licenses/${licenseId}/assign`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ beneficiaryType: "STUDENT", beneficiaryStudentId: studentBeneficiary.id, tenantId: tenant.id });
    expect(missingBillingPeriodAssign.status).toBe(400);

    const missingTenantIdAssign = await request(app)
      .post(`/api/v1/platform/licenses/${licenseId}/assign`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        beneficiaryType: "STUDENT",
        beneficiaryStudentId: studentBeneficiary.id,
        billingPeriod: "MONTHLY",
      });
    expect(missingTenantIdAssign.status).toBe(400);

    const assigned = await request(app)
      .post(`/api/v1/platform/licenses/${licenseId}/assign`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({
        beneficiaryType: "STUDENT",
        beneficiaryStudentId: studentBeneficiary.id,
        tenantId: tenant.id,
        billingPeriod: "MONTHLY",
      });
    expect(assigned.status).toBe(200);
    expect((assigned.body as { status: string }).status).toBe("ASSIGNED");

    const createdSubscription = await testAdminPrisma.subscription.findFirstOrThrow({
      where: { owner: { studentId: studentBeneficiary.id } },
    });
    expect(createdSubscription.status).toBe("ACTIVE");
    expect(createdSubscription.fundingSource).toBe("SCHOOL_SPONSORED");
    expect(createdSubscription.planId).toBe(studentPlan.id);

    const assignment = await testAdminPrisma.licenseAssignment.findFirstOrThrow({
      where: { licenseId },
    });
    expect(assignment.subscriptionId).toBe(createdSubscription.id);

    const entitlements = await testAdminPrisma.entitlement.findMany({
      where: { subscriptionId: createdSubscription.id },
    });
    expect(entitlements.length).toBeGreaterThan(0);
  }, 20000);
});
