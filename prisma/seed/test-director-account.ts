/** Compte de direction local pour vérifier la publication des évaluations. */
import { PrismaClient } from "@prisma/client";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const db = new PrismaClient();
async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !url.pathname.endsWith("_dev"))
    throw new Error("Base locale _dev requise");
  if (!process.env.TEST_DIRECTOR_PASSWORD) throw new Error("TEST_DIRECTOR_PASSWORD requis");
  const argon = createRequire(resolve("apps/api/package.json"))("argon2") as {
    hash(s: string): Promise<string>;
  };
  const passwordHash = await argon.hash(process.env.TEST_DIRECTOR_PASSWORD);
  await db.$transaction(async (tx) => {
    const { tenantId } = await tx.tenantDomain.findUniqueOrThrow({ where: { subdomain: "ecolevie" } });
    const email = "direction.ecolevie@example.test";
    const existing = await tx.user.findUnique({ where: { email }, include: { profile: true } });
    if (existing && existing.profile?.displayName !== "LOCAL-DIRECTION-TEST")
      throw new Error("Email déjà affecté hors de ce jeu de test");
    const user =
      existing ??
      (await tx.user.create({
        data: {
          email,
          passwordHash,
          status: "ACTIVE",
          emailVerifiedAt: new Date(),
          profile: {
            create: {
              firstName: "Direction",
              lastName: "Test",
              displayName: "LOCAL-DIRECTION-TEST",
              locale: "fr",
            },
          },
        },
      }));
    await tx.tenantMembership.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId } },
      create: { userId: user.id, tenantId, status: "ACTIVE" },
      update: {},
    });
    const role = await tx.role.findUniqueOrThrow({ where: { code: "DIRECTOR" } });
    if (!(await tx.userRole.findFirst({ where: { userId: user.id, tenantId, roleId: role.id } }))) {
      await tx.userRole.create({
        data: {
          userId: user.id,
          tenantId,
          roleId: role.id,
          justification: "Compte local de démonstration pour la publication des notes",
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: user.id,
          action: "LOCAL_TEST_DIRECTOR_CREATED",
          entityType: "User",
          entityId: user.id,
        },
      });
    }
    console.log("Compte de direction local prêt :", email);
  });
}
main().finally(() => db.$disconnect());
