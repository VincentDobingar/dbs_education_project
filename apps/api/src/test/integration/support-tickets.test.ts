import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole } from "../fixtures.js";

describe("tickets de support — côté tenant (§31 tranche 5)", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.supportTicketMessage.deleteMany({
      where: { ticket: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.supportTicket.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  it("ouvre, liste et répond à ses propres tickets — notes internes cachées, ticket fermé refuse un nouveau message", async () => {
    const { tenant, subdomain } = await createTenant("SupportTenant");
    createdTenantIds.push(tenant.id);
    const { tenant: otherTenant, subdomain: otherSubdomain } = await createTenant("OtherSupportTenant");
    createdTenantIds.push(otherTenant.id);

    const owner = await createUser("ticket-owner");
    await addMembership(owner.id, tenant.id);
    await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);
    const ownerToken = signAccessToken({ sub: owner.id });

    const otherOwner = await createUser("ticket-other");
    await addMembership(otherOwner.id, otherTenant.id);
    await grantRole(otherOwner.id, "SCHOOL_OWNER", otherTenant.id);
    const otherToken = signAccessToken({ sub: otherOwner.id });

    const created = await request(app)
      .post("/api/v1/communication/support-tickets")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ subject: "Impossible de générer les bulletins", priority: "HIGH" });
    expect(created.status).toBe(201);
    const ticketId = (created.body as { id: string }).id;

    const list = await request(app)
      .get("/api/v1/communication/support-tickets")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(list.status).toBe(200);
    expect((list.body as { id: string }[]).some((t) => t.id === ticketId)).toBe(true);

    const deniedForOther = await request(app)
      .get(`/api/v1/communication/support-tickets/${ticketId}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .set("X-Tenant-Slug", otherSubdomain);
    expect(deniedForOther.status).toBe(404);

    await testAdminPrisma.supportTicketMessage.create({
      data: { ticketId, authorUserId: owner.id, body: "Note interne équipe support", isInternalNote: true },
    });

    const detail = await request(app)
      .get(`/api/v1/communication/support-tickets/${ticketId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(detail.status).toBe(200);
    expect((detail.body as { messages: unknown[] }).messages.length).toBe(0);

    const addedMessage = await request(app)
      .post(`/api/v1/communication/support-tickets/${ticketId}/messages`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ body: "Toujours bloqué après redémarrage." });
    expect(addedMessage.status).toBe(201);

    await testAdminPrisma.supportTicket.update({ where: { id: ticketId }, data: { status: "CLOSED" } });

    const messageOnClosed = await request(app)
      .post(`/api/v1/communication/support-tickets/${ticketId}/messages`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ body: "Encore un souci ?" });
    expect(messageOnClosed.status).toBe(409);
    expect((messageOnClosed.body as { code: string }).code).toBe("SUPPORT_TICKET_CLOSED");
  });
});
