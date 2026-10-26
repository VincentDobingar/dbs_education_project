/** Comptes élèves réservés aux six dossiers LOCAL-PARCOURS de développement. */
import { PrismaClient } from "@prisma/client";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const p = new PrismaClient();
async function main() {
  const db = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(db.hostname) || !db.pathname.endsWith("_dev"))
    throw new Error("Base locale de développement requise");
  if (!process.env.TEST_STUDENT_PASSWORD) throw new Error("TEST_STUDENT_PASSWORD requis");
  const argon = createRequire(resolve("apps/api/package.json"))("argon2") as {
    hash(
      s: string,
      o: { type: number; memoryCost: number; timeCost: number; parallelism: number },
    ): Promise<string>;
  };
  const passwordHash = await argon.hash(process.env.TEST_STUDENT_PASSWORD, {
    type: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  await p.$transaction(
    async (tx) => {
      const admin = await tx.user.findUniqueOrThrow({ where: { email: "dobingar.vincent@dbs-africa.org" } });
      const schools = await tx.tenant.findMany({
        where: { deletedAt: null, domains: { some: { subdomain: { in: ["aurigeo", "ecolevie"] } } } },
        include: { domains: true },
      });
      if (schools.length !== 2) throw new Error("Deux établissements de test requis");
      for (const school of schools) {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${school.id}, true)`;
        const students = await tx.student.findMany({
          where: {
            tenantId: school.id,
            deletedAt: null,
            matricule: { in: [1, 2, 3].map((i) => "LOCAL-PARCOURS-" + i) },
          },
          orderBy: { matricule: "asc" },
        });
        if (students.length !== 3) throw new Error("Trois dossiers de test requis par établissement");
        for (const student of students) {
          const slug = school.domains.find((d) => ["aurigeo", "ecolevie"].includes(d.subdomain))!.subdomain;
          const email = "eleve." + slug + "." + student.matricule.split("-").at(-1) + "@example.test";
          const existing = await tx.user.findUnique({ where: { email } });
          const link = await tx.studentUserLink.findUnique({ where: { studentId: student.id } });
          if (link && link.userId !== existing?.id) throw new Error("Dossier déjà lié à un autre compte");
          if (existing && !link) throw new Error("Email déjà utilisé par un compte non lié à ce dossier");
          const user =
            existing ??
            (await tx.user.create({
              data: {
                email,
                passwordHash,
                status: "ACTIVE",
                emailVerifiedAt: new Date(),
                profile: {
                  create: { firstName: student.firstName, lastName: student.lastName, locale: "fr" },
                },
              },
            }));
          if (!link) {
            await tx.studentUserLink.create({
              data: { studentId: student.id, userId: user.id, tenantId: school.id },
            });
            await tx.auditLog.create({
              data: {
                actorUserId: admin.id,
                tenantId: school.id,
                action: "LOCAL_TEST_STUDENT_ACCOUNT_CREATED",
                entityType: "User",
                entityId: user.id,
              },
            });
          }
          console.log(
            JSON.stringify({
              eleve: student.firstName + " " + student.lastName,
              etablissement: school.name,
              email,
              studentId: student.id,
            }),
          );
        }
      }
    },
    { timeout: 60000 },
  );
}
main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void p.$disconnect());
