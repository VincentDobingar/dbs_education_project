import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

/**
 * Finalisation Phase 2 : `recordAuditLog` n'était exercé que côté super-admin (§31).
 * Ces tests couvrent les six actions tenant-internes sensibles désormais auditées
 * (RBAC + financier) — un audit log réel (interrogé via la même route super-admin
 * que §31, AuditLog n'étant pas un modèle tenant-scoped) apparaît pour chacune.
 */
describe("audit log des actions tenant-internes sensibles (finalisation Phase 2)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.studentPaymentRefund.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.studentReceipt.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.studentPayment.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.studentInvoiceItem.deleteMany({
      where: { invoice: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.studentInvoice.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.employee.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.academicYear.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
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

  async function auditActionsFor(
    superAdminToken: string,
    tenantId: string,
    entityType: string,
  ): Promise<string[]> {
    const res = await request(app)
      .get(`/api/v1/platform/audit-logs?tenantId=${tenantId}&entityType=${entityType}`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(res.status).toBe(200);
    return (res.body as { action: string }[]).map((log) => log.action);
  }

  it("audits role grant/revoke and membership status changes (tenant-users, §17)", async () => {
    const { tenant, subdomain } = await createTenant("AuditTenant");
    createdTenantIds.push(tenant.id);

    const owner = await createUser("audit-owner");
    await addMembership(owner.id, tenant.id);
    await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);
    const ownerToken = signAccessToken({ sub: owner.id });

    const superAdmin = await createUser("audit-super");
    await grantRole(superAdmin.id, "SUPER_ADMIN", null);
    const superAdminToken = signAccessToken({ sub: superAdmin.id });

    const invited = await request(app)
      .post("/api/v1/tenant-users")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        email: `audit-member-${uniqueSuffix()}@example.test`,
        roleCode: "TEACHER",
        firstName: "Awa",
        lastName: "Diop",
      });
    expect(invited.status).toBe(201);
    const memberId = (invited.body as { userId: string }).userId;

    const granted = await request(app)
      .post(`/api/v1/tenant-users/${memberId}/roles`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ roleCode: "SCHOOL_ADMIN" });
    expect(granted.status).toBe(204);

    const revoked = await request(app)
      .delete(`/api/v1/tenant-users/${memberId}/roles/SCHOOL_ADMIN`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(revoked.status).toBe(204);

    const suspended = await request(app)
      .patch(`/api/v1/tenant-users/${memberId}/status`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ status: "SUSPENDED" });
    expect(suspended.status).toBe(204);

    const roleActions = await auditActionsFor(superAdminToken, tenant.id, "UserRole");
    expect(roleActions).toContain("tenant_user.role_grant");
    expect(roleActions).toContain("tenant_user.role_revoke");

    const membershipActions = await auditActionsFor(superAdminToken, tenant.id, "TenantMembership");
    expect(membershipActions).toContain("tenant_user.membership_status_update");

    const auditLogsRes = await request(app)
      .get(`/api/v1/platform/audit-logs?tenantId=${tenant.id}&entityType=UserRole`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    const grantLog = (auditLogsRes.body as { action: string; actorUserId: string }[]).find(
      (log) => log.action === "tenant_user.role_grant",
    );
    expect(grantLog?.actorUserId).toBe(owner.id);
  });

  it("audits activation invitation revocation and parent-student relationship revocation (§8/§9)", async () => {
    const { tenant, subdomain } = await createTenant("AuditTenant");
    createdTenantIds.push(tenant.id);

    const admin = await createUser("audit-family-admin");
    await addMembership(admin.id, tenant.id);
    await grantRole(admin.id, "SCHOOL_OWNER", tenant.id);
    const adminToken = signAccessToken({ sub: admin.id });

    const superAdmin = await createUser("audit-family-super");
    await grantRole(superAdmin.id, "SUPER_ADMIN", null);
    const superAdminToken = signAccessToken({ sub: superAdmin.id });

    const student = await request(app)
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ matricule: `MAT-${uniqueSuffix()}`, firstName: "Boris", lastName: "Ekani" });
    const studentId = (student.body as { id: string }).id;

    // Invitation revoquee sans jamais etre redimee.
    const invitationToRevoke = await request(app)
      .post("/api/v1/family/invitations")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        studentId,
        beneficiaryCategory: "PARENT",
        invitedEmail: `invitee-${uniqueSuffix()}@example.test`,
      });
    const invitationId = (invitationToRevoke.body as { invitation: { id: string } }).invitation.id;

    const revokedInvitation = await request(app)
      .post(`/api/v1/family/invitations/${invitationId}/revoke`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(revokedInvitation.status).toBe(200);

    // Relation verifiee, puis revoquee.
    const parent = await createUser("audit-family-parent");
    const parentToken = signAccessToken({ sub: parent.id });

    const invitationToRedeem = await request(app)
      .post("/api/v1/family/invitations")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, beneficiaryCategory: "PARENT", invitedEmail: parent.email });
    const redeemed = await request(app)
      .post("/api/v1/family/activation/redeem")
      .set("Authorization", `Bearer ${parentToken}`)
      .send({ code: (invitationToRedeem.body as { code: string }).code });
    expect(redeemed.status).toBe(200);
    const relationshipId = (redeemed.body as { relationship: { id: string } }).relationship.id;

    const revokedRelationship = await request(app)
      .post(`/api/v1/family/relationships/${relationshipId}/revoke`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ reason: "Erreur de rattachement" });
    expect(revokedRelationship.status).toBe(200);

    const invitationActions = await auditActionsFor(superAdminToken, tenant.id, "ActivationInvitation");
    expect(invitationActions).toContain("activation_invitation.revoke");

    const relationshipActions = await auditActionsFor(
      superAdminToken,
      tenant.id,
      "ParentStudentRelationship",
    );
    expect(relationshipActions).toContain("parent_student_relationship.revoke");

    const relationshipLogsRes = await request(app)
      .get(`/api/v1/platform/audit-logs?tenantId=${tenant.id}&entityType=ParentStudentRelationship`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    const revokeLog = (relationshipLogsRes.body as { action: string; justification: string | null }[]).find(
      (log) => log.action === "parent_student_relationship.revoke",
    );
    expect(revokeLog?.justification).toBe("Erreur de rattachement");
  }, 20000);

  it("audits student invoice cancellation and payment refund (§23)", async () => {
    const { tenant, subdomain } = await createTenant("AuditTenant");
    createdTenantIds.push(tenant.id);

    const agent = await createUser("audit-fin-agent");
    await addMembership(agent.id, tenant.id);
    await grantRole(agent.id, "SCHOOL_OWNER", tenant.id);
    const agentToken = signAccessToken({ sub: agent.id });

    const superAdmin = await createUser("audit-fin-super");
    await grantRole(superAdmin.id, "SUPER_ADMIN", null);
    const superAdminToken = signAccessToken({ sub: superAdmin.id });

    await request(app)
      .post("/api/v1/employees")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({
        employeeNumber: `EMP-${uniqueSuffix()}`,
        firstName: "Fatou",
        lastName: "Diallo",
        jobTitle: "Agent comptable",
        userId: agent.id,
      });

    const year = await request(app)
      .post("/api/v1/school-config/academic-years")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ name: `Y-${uniqueSuffix()}`, startDate: "2025-09-01", endDate: "2026-06-30" });
    const academicYearId = (year.body as { id: string }).id;

    const student = await request(app)
      .post("/api/v1/students")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ matricule: `MAT-${uniqueSuffix()}`, firstName: "Léo", lastName: "Kane" });
    const studentId = (student.body as { id: string }).id;

    // Facture annulee directement (jamais payee).
    const invoiceToCancel = await request(app)
      .post("/api/v1/finance/student-invoices")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, academicYearId, items: [{ description: "Frais divers", amountCents: 5_000 }] });
    const invoiceToCancelId = (invoiceToCancel.body as { id: string }).id;

    const cancelled = await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceToCancelId}/cancel`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    expect(cancelled.status).toBe(200);

    // Facture payee puis remboursee.
    const invoiceToRefund = await request(app)
      .post("/api/v1/finance/student-invoices")
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ studentId, academicYearId, items: [{ description: "Scolarité", amountCents: 50_000 }] });
    const invoiceToRefundId = (invoiceToRefund.body as { id: string }).id;
    await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceToRefundId}/issue`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send();
    const payment = await request(app)
      .post(`/api/v1/finance/student-invoices/${invoiceToRefundId}/payments`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 50_000 });
    const paymentId = (payment.body as { id: string }).id;

    const refunded = await request(app)
      .post(`/api/v1/finance/payments/${paymentId}/refunds`)
      .set("Authorization", `Bearer ${agentToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ amountCents: 50_000, reason: "Trop-perçu" });
    expect(refunded.status).toBe(201);

    const invoiceActions = await auditActionsFor(superAdminToken, tenant.id, "StudentInvoice");
    expect(invoiceActions).toContain("student_invoice.cancel");

    const refundLogsRes = await request(app)
      .get(`/api/v1/platform/audit-logs?tenantId=${tenant.id}&entityType=StudentPaymentRefund`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    const refundLog = (
      refundLogsRes.body as { action: string; actorUserId: string; justification: string | null }[]
    ).find((log) => log.action === "student_payment.refund");
    expect(refundLog?.actorUserId).toBe(agent.id);
    expect(refundLog?.justification).toBe("Trop-perçu");
  }, 20000);
});
