import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";

import { createApp } from "../../app.js";
import { signAccessToken } from "../../lib/jwt.js";
import { testAdminPrisma } from "../admin-client.js";
import { addMembership, createTenant, createUser, grantRole } from "../fixtures.js";

// 1x1 pixel PNG, transparent — le plus petit fichier valide que pdfkit sache décoder.
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

// Amélioration abonnement : le responsable d'un établissement peut fournir l'URL
// du logo de son établissement (même convention que Student.photoUrl, §19 — une
// URL déjà hébergée ailleurs, jamais un upload de fichier) pour l'intégrer dans
// les documents générés (bulletins, reçus, rapports financiers, cartes scolaires).
describe("logo de l'établissement", () => {
  const app = createApp();
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    await testAdminPrisma.userRole.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantMembership.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenantDomain.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
    await testAdminPrisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
  });

  async function setUpTenant(): Promise<{ subdomain: string; ownerToken: string; teacherToken: string }> {
    const { tenant, subdomain } = await createTenant("LogoTenant");
    createdTenantIds.push(tenant.id);

    const owner = await createUser("logo-owner");
    await addMembership(owner.id, tenant.id);
    await grantRole(owner.id, "SCHOOL_OWNER", tenant.id);

    const teacher = await createUser("logo-teacher");
    await addMembership(teacher.id, tenant.id);
    await grantRole(teacher.id, "TEACHER", tenant.id);

    return {
      subdomain,
      ownerToken: signAccessToken({ sub: owner.id }),
      teacherToken: signAccessToken({ sub: teacher.id }),
    };
  }

  it("starts with no logo, lets SCHOOL_OWNER set one, readable by any tenant member", async () => {
    const { subdomain, ownerToken, teacherToken } = await setUpTenant();

    const initial = await request(app)
      .get("/api/v1/school-config/tenant-logo")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect(initial.status).toBe(200);
    expect((initial.body as { logoUrl: string | null }).logoUrl).toBeNull();

    const denied = await request(app)
      .put("/api/v1/school-config/tenant-logo")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ logoUrl: "https://example.test/logo.png" });
    expect(denied.status).toBe(403);

    const updated = await request(app)
      .put("/api/v1/school-config/tenant-logo")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ logoUrl: "https://example.test/logo.png" });
    expect(updated.status).toBe(200);
    expect((updated.body as { logoUrl: string }).logoUrl).toBe("https://example.test/logo.png");

    const afterUpdate = await request(app)
      .get("/api/v1/school-config/tenant-logo")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((afterUpdate.body as { logoUrl: string }).logoUrl).toBe("https://example.test/logo.png");
  });

  it("rejects a non-http(s) logoUrl (§34, injection de script)", async () => {
    const { subdomain, ownerToken } = await setUpTenant();

    const response = await request(app)
      .put("/api/v1/school-config/tenant-logo")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .send({ logoUrl: "javascript:alert(document.cookie)" });

    expect(response.status).toBe(400);
  });

  it("uploads a logo file directly (PNG), stores it, and persists the resulting URL on the tenant", async () => {
    const { subdomain, ownerToken, teacherToken } = await setUpTenant();

    const denied = await request(app)
      .post("/api/v1/school-config/tenant-logo/upload")
      .set("Authorization", `Bearer ${teacherToken}`)
      .set("X-Tenant-Slug", subdomain)
      .attach("logo", TINY_PNG, { filename: "logo.png", contentType: "image/png" });
    expect(denied.status).toBe(403);

    const uploaded = await request(app)
      .post("/api/v1/school-config/tenant-logo/upload")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .attach("logo", TINY_PNG, { filename: "logo.png", contentType: "image/png" });
    expect(uploaded.status).toBe(200);
    const logoUrl = (uploaded.body as { logoUrl: string }).logoUrl;
    expect(logoUrl).toMatch(/^http:\/\/localhost:4000\/uploads\/tenant-logos\/.+\.png$/);

    const afterUpload = await request(app)
      .get("/api/v1/school-config/tenant-logo")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain);
    expect((afterUpload.body as { logoUrl: string }).logoUrl).toBe(logoUrl);
  });

  // helmet() pose Cross-Origin-Resource-Policy: same-origin par défaut sur toute
  // réponse — correct pour l'API JSON, mais bloque silencieusement côté
  // navigateur (jamais côté serveur, curl ne reproduit pas ce blocage) le
  // chargement d'un logo par un <img> depuis l'origine du frontend (un port
  // différent en dev, un sous-domaine différent en prod). /uploads doit relâcher
  // cette politique spécifiquement, sans toucher au reste de l'API (app.ts).
  it("serves uploaded files with Cross-Origin-Resource-Policy: cross-origin, so a browser can embed them from another origin", async () => {
    const { subdomain, ownerToken } = await setUpTenant();

    const uploaded = await request(app)
      .post("/api/v1/school-config/tenant-logo/upload")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .attach("logo", TINY_PNG, { filename: "logo.png", contentType: "image/png" });
    const logoUrl = (uploaded.body as { logoUrl: string }).logoUrl;
    const uploadPath = new URL(logoUrl).pathname;

    const served = await request(app).get(uploadPath);
    expect(served.status).toBe(200);
    expect(served.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });

  it("rejects an upload that isn't a JPEG/PNG image", async () => {
    const { subdomain, ownerToken } = await setUpTenant();

    const response = await request(app)
      .post("/api/v1/school-config/tenant-logo/upload")
      .set("Authorization", `Bearer ${ownerToken}`)
      .set("X-Tenant-Slug", subdomain)
      .attach("logo", Buffer.from("not an image"), { filename: "logo.txt", contentType: "text/plain" });

    expect(response.status).toBe(400);
    expect((response.body as { code: string }).code).toBe("LOGO_FILE_REQUIRED");
  });
});
