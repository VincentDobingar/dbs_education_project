import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole } from "../fixtures.js";

describe("super-administration — tickets de support (§31 tranche 5)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.auditLog.deleteMany({ where: { actorUserId: { in: createdUserIds } } });
    await testAdminPrisma.supportTicketMessage.deleteMany({
      where: { ticket: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.supportTicket.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({
      where: {
        OR: [{ tenantId: { in: createdTenantIds } }, { userId: { in: createdUserIds }, tenantId: null }],
      },
    });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  it("triage complet — assignation, changement de statut, réponse avec note interne, moindre privilège respecté", async () => {
    const { tenant, subdomain } = await createTenant("SupportAdminTenant");
    createdTenantIds.push(tenant.id);

    const owner = await createUser("ticket-req-owner");
    createdUserIds.push(owner.id);
    await addMembership(owner.id, tenant.id);
    await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);
    const ownerToken = signAccessToken({ sub: owner.id });

    const superAdmin = await createUser("ticket-super");
    createdUserIds.push(superAdmin.id);
    await grantRole(superAdmin.id, "SUPER_ADMIN", null);
    const superAdminToken = signAccessToken({ sub: superAdmin.id });

    const supportAgent = await createUser("ticket-agent");
    createdUserIds.push(supportAgent.id);
    await grantRole(supportAgent.id, "SUPPORT_AGENT", null);
    const supportAgentToken = signAccessToken({ sub: supportAgent.id });

    const platformAdmin = await createUser("ticket-platform-admin");
    createdUserIds.push(platformAdmin.id);
    await grantRole(platformAdmin.id, "PLATFORM_ADMIN", null);
    const platformAdminToken = signAccessToken({ sub: platformAdmin.id });

    const ordinary = await createUser("ticket-ordinary");
    createdUserIds.push(ordinary.id);
    const ordinaryToken = signAccessToken({ sub: ordinary.id });

    const created = await request(app)
      .post("/api/v1/communication/support-tickets")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ subject: "Question de facturation" });
    expect(created.status).toBe(201);
    const ticketId = (created.body as { id: string }).id;

    const listDeniedForOrdinary = await request(app)
      .get("/api/v1/platform/support-tickets")
      .set("Authorization", `Bearer ${ordinaryToken}`);
    expect(listDeniedForOrdinary.status).toBe(403);

    const listByPlatformAdmin = await request(app)
      .get(`/api/v1/platform/support-tickets?tenantId=${tenant.id}`)
      .set("Authorization", `Bearer ${platformAdminToken}`);
    expect(listByPlatformAdmin.status).toBe(200);
    expect((listByPlatformAdmin.body as { id: string }[]).some((t) => t.id === ticketId)).toBe(true);

    const manageDeniedForPlatformAdmin = await request(app)
      .post(`/api/v1/platform/support-tickets/${ticketId}/assign`)
      .set("Authorization", `Bearer ${platformAdminToken}`)
      .send({ assignedToUserId: supportAgent.id });
    expect(manageDeniedForPlatformAdmin.status).toBe(403);

    const assignToMissingUser = await request(app)
      .post(`/api/v1/platform/support-tickets/${ticketId}/assign`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ assignedToUserId: "does-not-exist" });
    expect(assignToMissingUser.status).toBe(404);
    expect((assignToMissingUser.body as { code: string }).code).toBe("USER_NOT_FOUND");

    const assigned = await request(app)
      .post(`/api/v1/platform/support-tickets/${ticketId}/assign`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ assignedToUserId: supportAgent.id });
    expect(assigned.status).toBe(200);
    expect((assigned.body as { assignedToUserId: string }).assignedToUserId).toBe(supportAgent.id);

    const replied = await request(app)
      .post(`/api/v1/platform/support-tickets/${ticketId}/messages`)
      .set("Authorization", `Bearer ${supportAgentToken}`)
      .send({ body: "Note interne pour l'équipe", isInternalNote: true });
    expect(replied.status).toBe(201);
    expect((replied.body as { isInternalNote: boolean }).isInternalNote).toBe(true);

    const inProgress = await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticketId}/status`)
      .set("Authorization", `Bearer ${supportAgentToken}`)
      .send({ status: "IN_PROGRESS" });
    expect(inProgress.status).toBe(200);
    expect((inProgress.body as { closedAt: string | null }).closedAt).toBeNull();

    const closed = await request(app)
      .patch(`/api/v1/platform/support-tickets/${ticketId}/status`)
      .set("Authorization", `Bearer ${supportAgentToken}`)
      .send({ status: "CLOSED" });
    expect(closed.status).toBe(200);
    expect((closed.body as { closedAt: string | null }).closedAt).not.toBeNull();

    const messageOnClosedDenied = await request(app)
      .post(`/api/v1/platform/support-tickets/${ticketId}/messages`)
      .set("Authorization", `Bearer ${supportAgentToken}`)
      .send({ body: "Trop tard" });
    expect(messageOnClosedDenied.status).toBe(409);

    const detail = await request(app)
      .get(`/api/v1/platform/support-tickets/${ticketId}`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(detail.status).toBe(200);
    expect((detail.body as { messages: unknown[] }).messages.length).toBe(1);

    const auditLogs = await request(app)
      .get(`/api/v1/platform/audit-logs?entityType=SupportTicket`)
      .set("Authorization", `Bearer ${superAdminToken}`);
    expect(auditLogs.status).toBe(200);
    const actions = (auditLogs.body as { action: string; entityId: string }[])
      .filter((log) => log.entityId === ticketId)
      .map((log) => log.action);
    expect(actions).toContain("support_ticket.assign");
    expect(actions).toContain("support_ticket.message");
    expect(actions).toContain("support_ticket.status_update");
  }, 20000);
});
