/** Compte enseignant de démonstration, exclusivement sur la base locale _dev. */
import { PrismaClient } from "@prisma/client";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const db = new PrismaClient();
async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !url.pathname.endsWith("_dev"))
    throw new Error("Base locale de développement requise");
  if (!process.env.TEST_TEACHER_PASSWORD) throw new Error("TEST_TEACHER_PASSWORD requis");
  const email = "enseignant.ecolevie@example.test";
  const argon = createRequire(resolve("apps/api/package.json"))("argon2") as {
    hash(
      s: string,
      options: { type: number; memoryCost: number; timeCost: number; parallelism: number },
    ): Promise<string>;
  };
  const passwordHash = await argon.hash(process.env.TEST_TEACHER_PASSWORD, {
    type: 2,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  await db.$transaction(
    async (tx) => {
      const domain = await tx.tenantDomain.findUniqueOrThrow({ where: { subdomain: "ecolevie" } });
      const tenantId = domain.tenantId;
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      const year = await tx.academicYear.findFirstOrThrow({
        where: { tenantId, isCurrent: true, deletedAt: null },
      });
      const subject = await tx.subject.findFirstOrThrow({
        where: { tenantId, nameFr: { contains: "Math", mode: "insensitive" } },
      });
      const enrollments = await tx.enrollment.findMany({
        where: {
          tenantId,
          academicYearId: year.id,
          deletedAt: null,
          student: { matricule: { startsWith: "LOCAL-PARCOURS-" } },
        },
        include: { classroom: true },
      });
      if (!enrollments.length) throw new Error("Classes de démonstration requises");
      const existing = await tx.user.findUnique({ where: { email } });
      const employee = await tx.employee.findUnique({
        where: { tenantId_employeeNumber: { tenantId, employeeNumber: "LOCAL-ENSEIGNANT-TEST" } },
      });
      if (existing && employee?.userId !== existing.id)
        throw new Error("Email déjà utilisé hors de ce jeu de test");
      const user =
        existing ??
        (await tx.user.create({
          data: {
            email,
            passwordHash,
            status: "ACTIVE",
            emailVerifiedAt: new Date(),
            profile: { create: { firstName: "Awa", lastName: "Enseignante-Test", locale: "fr" } },
          },
        }));
      if (!(await tx.tenantMembership.findFirst({ where: { tenantId, userId: user.id } })))
        await tx.tenantMembership.create({ data: { tenantId, userId: user.id, status: "ACTIVE" } });
      const role = await tx.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
      if (!(await tx.userRole.findFirst({ where: { tenantId, userId: user.id, roleId: role.id } })))
        await tx.userRole.create({ data: { tenantId, userId: user.id, roleId: role.id } });
      const staff =
        employee ??
        (await tx.employee.create({
          data: {
            tenantId,
            employeeNumber: "LOCAL-ENSEIGNANT-TEST",
            firstName: "Awa",
            lastName: "Enseignante-Test",
            jobTitle: "Enseignante de mathématiques",
            email,
            subjectId: subject.id,
            userId: user.id,
          },
        }));
      for (const classroomId of new Set(enrollments.map((e) => e.classroomId))) {
        await tx.teacherAssignment.upsert({
          where: {
            employeeId_subjectId_classroomId_academicYearId: {
              employeeId: staff.id,
              subjectId: subject.id,
              classroomId,
              academicYearId: year.id,
            },
          },
          create: {
            tenantId,
            employeeId: staff.id,
            subjectId: subject.id,
            classroomId,
            academicYearId: year.id,
          },
          update: {},
        });
      }
      if (!existing)
        await tx.auditLog.create({
          data: {
            tenantId,
            action: "LOCAL_TEST_TEACHER_CREATED",
            entityType: "Employee",
            entityId: staff.id,
            afterData: { purpose: "Local teacher dashboard verification" },
          },
        });
      console.log(
        JSON.stringify({
          email,
          subdomain: "ecolevie",
          subject: subject.nameFr,
          classes: [...new Set(enrollments.map((e) => e.classroom.name))],
          created: !existing,
        }),
      );
    },
    { timeout: 20000 },
  );
}
main()
  .finally(() => db.$disconnect())
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : "Échec du seed");
    process.exitCode = 1;
  });
