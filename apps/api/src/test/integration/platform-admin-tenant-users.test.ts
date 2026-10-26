import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import {
  registerEmailProviderAdapter,
  resetEmailProviderAdapter,
} from "../../lib/email-provider/registry.js";
import type { EmailProviderAdapter, SendEmailInput } from "../../lib/email-provider/types.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { createTenant, createUser, grantRole, uniqueSuffix } from "../fixtures.js";

describe("super-administration — comptes des établissements", () => {
  const app = createApp();
  const createdUserIds: string[] = [];
  const createdTenantIds: string[] = [];
  const createdEmails: string[] = [];
  let sent: SendEmailInput[] = [];

  beforeEach(() => {
    sent = [];
    const adapter: EmailProviderAdapter = {
      code: "FAKE",
      send: (input) => {
        sent.push(input);
        return Promise.resolve();
      },
    };
    registerEmailProviderAdapter(adapter);
  });

  afterEach(() => {
    resetEmailProviderAdapter();
  });

  afterAll(async () => {
    await testAdminPrisma.auditLog.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.userRole.deleteMany({ where: { userId: { in: createdUserIds }, tenantId: null } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.subscription.deleteMany({
      where: { owner: { tenantId: { in: createdTenantIds } } },
    });
    await testAdminPrisma.subscriptionOwner.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
    await testAdminPrisma.user.deleteMany({ where: { email: { in: createdEmails } } });
  });

  it("ajoute un enseignant avec lien d'accès, gère ses rôles et son statut — refusé aux non-administrateurs", async () => {
    const { tenant } = await createTenant("UsersAdminTenant");
    createdTenantIds.push(tenant.id);

    const superAdmin = await createUser("users-super");
    createdUserIds.push(superAdmin.id);
    await grantRole(superAdmin.id, "SUPER_ADMIN", null);
    const token = signAccessToken({ sub: superAdmin.id });

    const auditor = await createUser("users-auditor");
    createdUserIds.push(auditor.id);
    await grantRole(auditor.id, "PLATFORM_AUDITOR", null);
    const auditorToken = signAccessToken({ sub: auditor.id });

    const email = `enseignant-${uniqueSuffix()}@example.test`;
    createdEmails.push(email);
    const invite = {
      email,
      firstName: "Awa",
      lastName: "Moussa",
      roleCode: "TEACHER",
      justification: "Création des comptes de l'établissement",
    };

    const deniedForAuditor = await request(app)
      .post(`/api/v1/platform/tenants/${tenant.id}/users`)
      .set("Authorization", `Bearer ${auditorToken}`)
      .send(invite);
    expect(deniedForAuditor.status).toBe(403);

    const noJustification = await request(app)
      .post(`/api/v1/platform/tenants/${tenant.id}/users`)
      .set("Authorization", `Bearer ${token}`)
      .send({ ...invite, justification: "" });
    expect(noJustification.status).toBe(400);

    const created = await request(app)
      .post(`/api/v1/platform/tenants/${tenant.id}/users`)
      .set("Authorization", `Bearer ${token}`)
      .send(invite);
    expect(created.status).toBe(201);
    const { userId } = created.body as { userId: string; created: boolean };
    expect((created.body as { created: boolean }).created).toBe(true);

    // Lien « choisir un mot de passe » envoyé, jamais de mot de passe dans la réponse.
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(email);
    expect(sent[0]?.text).toContain("/reinitialiser-mot-de-passe?espace=staff#token=");

    const duplicate = await request(app)
      .post(`/api/v1/platform/tenants/${tenant.id}/users`)
      .set("Authorization", `Bearer ${token}`)
      .send(invite);
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as { code: string }).code).toBe("ALREADY_MEMBER");

    const grant = await request(app)
      .post(`/api/v1/platform/tenants/${tenant.id}/users/${userId}/roles`)
      .set("Authorization", `Bearer ${token}`)
      .send({ roleCode: "SUPERVISOR", justification: "Surveillance des examens" });
    expect(grant.status).toBe(204);

    const suspend = await request(app)
      .patch(`/api/v1/platform/tenants/${tenant.id}/users/${userId}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "SUSPENDED", justification: "Congé longue durée" });
    expect(suspend.status).toBe(204);

    const revoke = await request(app)
      .delete(`/api/v1/platform/tenants/${tenant.id}/users/${userId}/roles/SUPERVISOR`)
      .set("Authorization", `Bearer ${token}`)
      .send({ justification: "Fin de la période d'examens" });
    expect(revoke.status).toBe(204);

    // Lecture permise à l'auditeur.
    const list = await request(app)
      .get(`/api/v1/platform/tenants/${tenant.id}/users`)
      .set("Authorization", `Bearer ${auditorToken}`);
    expect(list.status).toBe(200);
    const users = list.body as { userId: string; roleCodes: string[]; membershipStatus: string }[];
    const teacher = users.find((user) => user.userId === userId);
    expect(teacher?.roleCodes).toEqual(["TEACHER"]);
    expect(teacher?.membershipStatus).toBe("SUSPENDED");

    const resend = await request(app)
      .post(`/api/v1/platform/tenants/${tenant.id}/users/${userId}/access-email`)
      .set("Authorization", `Bearer ${token}`)
      .send({ justification: "Premier lien expiré" });
    expect(resend.status).toBe(204);
    expect(sent).toHaveLength(2);

    const audits = await testAdminPrisma.auditLog.findMany({
      where: { tenantId: tenant.id, action: { startsWith: "platform_tenant_user." } },
    });
    expect(audits.map((audit) => audit.action).sort()).toEqual([
      "platform_tenant_user.access_email",
      "platform_tenant_user.invite",
      "platform_tenant_user.membership_status_update",
      "platform_tenant_user.role_grant",
      "platform_tenant_user.role_revoke",
    ]);
    expect(audits.every((audit) => audit.justification)).toBe(true);
  });
});
