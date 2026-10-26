/**
 * Jeu de test local explicite : aucun envoi de message ou paiement réel.
 * TEST_ADMIN_PASSWORD et TEST_PARENT_PASSWORD requis à l'exécution.
 */
import { PrismaClient } from "@prisma/client";
import { createRequire } from "node:module";
import { resolve } from "node:path";
const argon2 = createRequire(resolve("apps/api/package.json"))("argon2") as {
  hash(
    value: string,
    options: { type: number; memoryCost: number; timeCost: number; parallelism: number },
  ): Promise<string>;
};
const hashPassword = (value: string) =>
  argon2.hash(value, { type: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
const p = new PrismaClient();
const ADMIN = "dobingar.vincent@dbs-africa.org";
const MARKER = "LOCAL-PARCOURS";
async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Base locale uniquement");
  if (!process.env.TEST_ADMIN_PASSWORD || !process.env.TEST_PARENT_PASSWORD)
    throw new Error("Mots de passe requis");
  const adminHash = await hashPassword(process.env.TEST_ADMIN_PASSWORD);
  const parentHash = await hashPassword(process.env.TEST_PARENT_PASSWORD);
  await p.$transaction(
    async (tx) => {
      const admin = await tx.user.upsert({
        where: { email: ADMIN },
        update: {
          passwordHash: adminHash,
          status: "ACTIVE",
          deletedAt: null,
          emailVerifiedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
        create: { email: ADMIN, passwordHash: adminHash, status: "ACTIVE", emailVerifiedAt: new Date() },
      });
      await tx.userProfile.upsert({
        where: { userId: admin.id },
        update: {},
        create: { userId: admin.id, firstName: "Vincent", lastName: "Dobingar", locale: "fr" },
      });
      const superRole = await tx.role.findUniqueOrThrow({ where: { code: "SUPER_ADMIN" } });
      if (
        !(await tx.userRole.findFirst({ where: { userId: admin.id, roleId: superRole.id, tenantId: null } }))
      )
        await tx.userRole.create({
          data: {
            userId: admin.id,
            roleId: superRole.id,
            tenantId: null,
            justification: "Création du superutilisateur local demandée par l'utilisateur",
          },
        });
      await tx.auditLog.create({
        data: {
          actorUserId: admin.id,
          action: "LOCAL_TEST_SUPER_ADMIN_PROVISIONED",
          entityType: "User",
          entityId: admin.id,
        },
      });
      const parents = [];
      for (const [email, firstName, lastName, phone] of [
        ["parent.famille@example.test", "Amina", "Test-Famille", "+237600001001"],
        ["parent.sansabonnement@example.test", "Paul", "Test-SansAbonnement", "+237600001002"],
      ]) {
        const user = await tx.user.upsert({
          where: { email: email! },
          update: {},
          create: {
            email: email!,
            passwordHash: parentHash,
            status: "ACTIVE",
            emailVerifiedAt: new Date(),
            profile: { create: { firstName: firstName!, lastName: lastName! } },
          },
        });
        const guardian = await tx.guardian.upsert({
          where: { userId: user.id },
          update: {},
          create: {
            userId: user.id,
            firstName: firstName!,
            lastName: lastName!,
            email: email!,
            phone: phone!,
            address: "Adresse de démonstration locale",
          },
        });
        let family = await tx.familyAccount.findFirst({ where: { primaryUserId: user.id, deletedAt: null } });
        family ??= await tx.familyAccount.create({ data: { primaryUserId: user.id, maxChildren: 50 } });
        await tx.familyMember.upsert({
          where: { familyAccountId_guardianId: { familyAccountId: family.id, guardianId: guardian.id } },
          update: {},
          create: { familyAccountId: family.id, guardianId: guardian.id, roleInFamily: "PRIMARY" },
        });
        parents.push({ user, guardian, family });
      }
      const plan = await tx.subscriptionPlan.findFirstOrThrow({
        where: { category: "PARENT", childrenCovered: { gte: 2 }, isActive: true },
      });
      const schoolRole = await tx.role.findUniqueOrThrow({ where: { code: "SCHOOL_ADMIN" } });
      const tenants = await tx.tenant.findMany({
        where: { deletedAt: null, domains: { some: { subdomain: { in: ["aurigeo", "ecolevie"] } } } },
        include: { domains: true },
      });
      if (tenants.length !== 2) throw new Error("Les deux établissements de test sont requis");
      for (const tenant of tenants) {
        const schoolOwner = await tx.subscriptionOwner.upsert({
          where: { tenantId: tenant.id },
          update: {},
          create: { ownerType: "SCHOOL", tenantId: tenant.id },
        });
        if (
          !(await tx.subscription.findFirst({
            where: {
              ownerId: schoolOwner.id,
              status: "ACTIVE",
              deletedAt: null,
              OR: [{ currentPeriodEndsAt: null }, { currentPeriodEndsAt: { gt: new Date() } }],
            },
          }))
        ) {
          const schoolPlan = await tx.subscriptionPlan.findUniqueOrThrow({
            where: { code: "SCHOOL_ESSENTIAL" },
          });
          await tx.subscription.upsert({
            where: { id: `${MARKER}-SCHOOL-${tenant.id}` },
            update: {},
            create: {
              id: `${MARKER}-SCHOOL-${tenant.id}`,
              ownerId: schoolOwner.id,
              planId: schoolPlan.id,
              status: "ACTIVE",
              fundingSource: "SELF_PAID",
              billingPeriod: "ANNUAL",
              startsAt: new Date(),
              currentPeriodEndsAt: new Date(Date.now() + 365 * 86400000),
              autoRenew: false,
              events: {
                create: {
                  toStatus: "ACTIVE",
                  actorUserId: admin.id,
                  reason: "Accès établissement fictif de test local, aucun paiement réel",
                },
              },
            },
          });
        }
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;
        const year = await tx.academicYear.findFirstOrThrow({
          where: { tenantId: tenant.id, isCurrent: true, deletedAt: null },
        });
        const classes = await tx.classroom.findMany({
          where: { tenantId: tenant.id, academicYearId: year.id, deletedAt: null },
          orderBy: { name: "asc" },
          take: 3,
        });
        if (classes.length < 3) throw new Error("Lancer les données de base avant ce script");
        await tx.tenantMembership.upsert({
          where: { userId_tenantId: { userId: admin.id, tenantId: tenant.id } },
          update: { status: "ACTIVE" },
          create: { userId: admin.id, tenantId: tenant.id, status: "ACTIVE", joinedAt: new Date() },
        });
        await tx.userRole.upsert({
          where: { userId_roleId_tenantId: { userId: admin.id, roleId: schoolRole.id, tenantId: tenant.id } },
          update: { expiresAt: null },
          create: { userId: admin.id, roleId: schoolRole.id, tenantId: tenant.id },
        });
        const period = await tx.registrationPeriod.upsert({
          where: {
            tenantId_academicYearId_name: { tenantId: tenant.id, academicYearId: year.id, name: MARKER },
          },
          update: {},
          create: {
            tenantId: tenant.id,
            academicYearId: year.id,
            name: MARKER,
            startDate: year.startDate,
            endDate: year.endDate,
            isOpen: true,
            installments: [0, 1, 2].map((i) => ({
              amountCents: 1000000,
              dueDate: new Date(
                year.startDate.getTime() + ((year.endDate.getTime() - year.startDate.getTime()) * i) / 3,
              ).toISOString(),
            })),
          },
        });
        const covered = [];
        for (let i = 0; i < 3; i++) {
          const parent = parents[i === 2 ? 1 : 0]!;
          const classroom = classes[i]!;
          let local = await tx.schoolGuardian.findFirst({
            where: { tenantId: tenant.id, centralGuardianId: parent.guardian.id },
          });
          local ??= await tx.schoolGuardian.create({
            data: {
              tenantId: tenant.id,
              centralGuardianId: parent.guardian.id,
              firstName: parent.guardian.firstName,
              lastName: parent.guardian.lastName,
              phone: parent.guardian.phone!,
              email: parent.guardian.email,
              address: parent.guardian.address,
            },
          });
          const student = await tx.student.upsert({
            where: { tenantId_matricule: { tenantId: tenant.id, matricule: `${MARKER}-${i + 1}` } },
            update: {},
            create: {
              tenantId: tenant.id,
              matricule: `${MARKER}-${i + 1}`,
              firstName: ["Sara", "Adam", "Luc"][i]!,
              lastName: parent.guardian.lastName,
              gender: i === 0 ? "FEMALE" : "MALE",
              dateOfBirth: new Date("2017-03-12"),
              status: "ACTIVE",
              primaryGuardianId: local.id,
            },
          });
          const enrollment = await tx.enrollment.upsert({
            where: { studentId_academicYearId: { studentId: student.id, academicYearId: year.id } },
            update: {},
            create: {
              tenantId: tenant.id,
              studentId: student.id,
              academicYearId: year.id,
              registrationPeriodId: period.id,
              classroomId: classroom.id,
              campusId: classroom.campusId,
              gradeLevelId: classroom.gradeLevelId,
              status: "ENROLLED",
            },
          });
          // Preuve synthétique d'activation réservée à ce jeu local, jamais une invitation envoyée.
          const invitationId = `${MARKER}-INV-${student.id}`;
          await tx.activationInvitation.upsert({
            where: { id: invitationId },
            update: {},
            create: {
              id: invitationId,
              tenantId: tenant.id,
              studentId: student.id,
              schoolGuardianId: local.id,
              beneficiaryCategory: "PARENT",
              invitedEmail: parent.user.email,
              status: "USED",
              createdByUserId: admin.id,
              expiresAt: new Date("2030-01-01"),
            },
          });
          await tx.parentStudentRelationship.upsert({
            where: { parentUserId_studentId: { parentUserId: parent.user.id, studentId: student.id } },
            update: {},
            create: {
              parentUserId: parent.user.id,
              studentId: student.id,
              tenantId: tenant.id,
              status: "VERIFIED",
              verifiedAt: new Date(),
            },
          });
          for (let j = 0; j < 3; j++)
            await tx.studentInvoice.upsert({
              where: { tenantId_number: { tenantId: tenant.id, number: `INS-${enrollment.id}-${j + 1}` } },
              update: {},
              create: {
                tenantId: tenant.id,
                studentId: student.id,
                academicYearId: year.id,
                number: `INS-${enrollment.id}-${j + 1}`,
                status: "ISSUED",
                totalCents: 1000000,
                issuedAt: new Date(),
                dueAt: new Date(
                  year.startDate.getTime() + ((year.endDate.getTime() - year.startDate.getTime()) * j) / 3,
                ),
                items: { create: { description: `${MARKER} — tranche ${j + 1}/3`, amountCents: 1000000 } },
              },
            });
          if (i < 2) covered.push(student);
        }
        const parent = parents[0]!;
        const owner = await tx.subscriptionOwner.upsert({
          where: { familyAccountId: parent.family.id },
          update: {},
          create: { ownerType: "PARENT", familyAccountId: parent.family.id },
        });
        const subId = `${MARKER}-SUB-${tenant.id}`;
        const sub = await tx.subscription.upsert({
          where: { id: subId },
          update: {},
          create: {
            id: subId,
            ownerId: owner.id,
            planId: plan.id,
            status: "ACTIVE",
            fundingSource: "SELF_PAID",
            billingPeriod: "ANNUAL",
            startsAt: new Date(),
            currentPeriodEndsAt: new Date(Date.now() + 365 * 86400000),
            autoRenew: false,
            events: {
              create: {
                toStatus: "ACTIVE",
                actorUserId: admin.id,
                reason: "Abonnement fictif de test local, aucun paiement réel",
              },
            },
          },
        });
        for (const student of covered)
          await tx.parentSubscriptionCoverage.upsert({
            where: {
              subscriptionId_studentId_tenantId: {
                subscriptionId: sub.id,
                studentId: student.id,
                tenantId: tenant.id,
              },
            },
            update: {},
            create: {
              subscriptionId: sub.id,
              studentId: student.id,
              tenantId: tenant.id,
              parentUserId: parent.user.id,
            },
          });
        console.log(
          JSON.stringify({
            etablissement: tenant.name,
            domaine: tenant.domains[0]?.subdomain,
            annee: year.name,
            eleves: 3,
            parents: 2,
            couverts: 2,
            factures: 9,
          }),
        );
      }
      // Même matérialisation des droits que pour une activation normale, sans remettre les quotas à zéro.
      const demos = await tx.subscription.findMany({
        where: { id: { startsWith: MARKER }, status: "ACTIVE", deletedAt: null },
        include: { plan: { include: { features: true } } },
      });
      for (const demo of demos)
        for (const feature of demo.plan.features)
          await tx.entitlement.upsert({
            where: {
              subscriptionId_featureCode: { subscriptionId: demo.id, featureCode: feature.featureCode },
            },
            update: {},
            create: {
              subscriptionId: demo.id,
              featureCode: feature.featureCode,
              isEnabled: feature.isIncluded,
              quotaLimit: feature.quotaLimit,
              expiresAt: demo.currentPeriodEndsAt,
            },
          });
      console.log(JSON.stringify({ superadmin: admin.email, parents: parents.map((x) => x.user.email) }));
    },
    { timeout: 120000 },
  );
}
main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void p.$disconnect());
