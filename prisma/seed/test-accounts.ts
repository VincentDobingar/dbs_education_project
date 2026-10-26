/**
 * Comptes de test « bout en bout » : un deuxième établissement complet (Collège
 * Horizon de Moundou, données de démonstration incluses) et quatre comptes —
 * direction, enseignant, élève, parent — pour tester chaque espace de la plateforme.
 *
 * Déclenché par le seed principal uniquement si SEED_TEST_ACCOUNTS_EMAIL est défini
 * (ex. prenom.nom@gmail.com). Les comptes reçoivent des alias de cette adresse
 * (prenom.nom+directeur@gmail.com, +enseignant, +eleve, +parent) : Gmail et la
 * plupart des messageries les livrent dans la même boîte.
 *
 * Aucun mot de passe n'est choisi ni affiché ici : chaque compte a un mot de passe
 * aléatoire inconnu, et la personne qui teste choisit le sien avec « Mot de passe
 * oublié ? » (ou « Renvoyer le lien d'accès » en super-administration).
 *
 * Idempotent : ne fait rien si l'établissement de test existe déjà.
 */
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";

import type { Prisma, PrismaClient } from "@prisma/client";

import { seedDemo } from "./demo/demo-data.js";
import { DEMO_MARKER } from "./demo/plan.js";

type Tx = Prisma.TransactionClient;

export const TEST_SCHOOL_SUBDOMAIN = "college-horizon";
const TEST_SCHOOL_NAME = "Collège Horizon de Moundou";

// argon2 est une dépendance de l'API, pas de la racine du dépôt : résolu depuis
// apps/api pour hacher exactement comme lib/password.ts.
interface Argon2 {
  argon2id: number;
  hash: (plain: string, options: Record<string, number>) => Promise<string>;
}
function loadArgon2(): Argon2 {
  const requireFromApi = createRequire(path.resolve(process.cwd(), "apps/api/package.json"));
  return requireFromApi("argon2") as Argon2;
}

async function unusablePasswordHash(argon2: Argon2): Promise<string> {
  return argon2.hash(randomBytes(24).toString("base64url"), {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export function aliasEmail(baseEmail: string, tag: string): string {
  const [local, domain] = baseEmail.trim().toLowerCase().split("@");
  if (!local || !domain) {
    throw new Error(`SEED_TEST_ACCOUNTS_EMAIL invalide : ${baseEmail}`);
  }
  return `${local.split("+")[0]}+${tag}@${domain}`;
}

async function activeSubscription(
  tx: Tx,
  owner: Prisma.SubscriptionOwnerUncheckedCreateInput,
  planCode: string,
): Promise<void> {
  const plan = await tx.subscriptionPlan.findUniqueOrThrow({
    where: { code: planCode },
    include: { features: true },
  });
  const createdOwner = await tx.subscriptionOwner.create({ data: owner });
  const now = new Date();
  const oneYearLater = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const subscription = await tx.subscription.create({
    data: {
      ownerId: createdOwner.id,
      planId: plan.id,
      status: "ACTIVE",
      fundingSource: "SELF_PAID",
      billingPeriod: "ANNUAL",
      startsAt: now,
      currentPeriodEndsAt: oneYearLater,
      endsAt: oneYearLater,
      autoRenew: false,
    },
  });
  const features = plan.features.filter((feature) => feature.isIncluded);
  if (features.length > 0) {
    await tx.entitlement.createMany({
      data: features.map((feature) => ({
        subscriptionId: subscription.id,
        featureCode: feature.featureCode,
        quotaLimit: feature.quotaLimit,
      })),
    });
  }
}

async function createUser(
  tx: Tx,
  argon2: Argon2,
  email: string,
  firstName: string,
  lastName: string,
): Promise<string> {
  const existing = await tx.user.findUnique({ where: { email } });
  if (existing) {
    return existing.id;
  }
  const user = await tx.user.create({
    data: {
      email,
      passwordHash: await unusablePasswordHash(argon2),
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
      profile: { create: { firstName, lastName, locale: "fr" } },
    },
  });
  return user.id;
}

async function grantTenantRole(tx: Tx, userId: string, tenantId: string, roleCode: string): Promise<void> {
  const role = await tx.role.findUniqueOrThrow({ where: { code: roleCode } });
  await tx.tenantMembership.create({ data: { userId, tenantId, status: "ACTIVE", joinedAt: new Date() } });
  await tx.userRole.create({ data: { userId, roleId: role.id, tenantId } });
}

export async function seedTestAccounts(prisma: PrismaClient, baseEmail: string): Promise<void> {
  const existing = await prisma.tenantDomain.findUnique({ where: { subdomain: TEST_SCHOOL_SUBDOMAIN } });
  if (existing) {
    console.log(`Test accounts: « ${TEST_SCHOOL_NAME} » already exists, nothing to do`);
    return;
  }

  const argon2 = loadArgon2();
  const emails = {
    director: aliasEmail(baseEmail, "directeur"),
    teacher: aliasEmail(baseEmail, "enseignant"),
    student: aliasEmail(baseEmail, "eleve"),
    parent: aliasEmail(baseEmail, "parent"),
  };

  await prisma.$transaction(
    async (tx) => {
      const country = await tx.country.findUniqueOrThrow({ where: { isoCode: "TD" } });
      const tenant = await tx.tenant.create({
        data: {
          name: TEST_SCHOOL_NAME,
          legalName: "Collège Horizon SARL",
          ownershipType: "PRIVATE",
          countryId: country.id,
          currencyId: country.defaultCurrencyId ?? "",
          region: "Logone Occidental",
          city: "Moundou",
          timezone: "Africa/Ndjamena",
          status: "ACTIVE",
          verifiedAt: new Date(),
          publicDescription:
            "Établissement de démonstration : collège-lycée privé de la 6e à la Terminale, utilisé pour tester la plateforme de bout en bout.",
          showOnHomepage: true,
        },
      });
      // Tables cloisonnées par la RLS : même mécanisme que withTenantSession côté API.
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;

      await tx.tenantDomain.create({
        data: { tenantId: tenant.id, subdomain: TEST_SCHOOL_SUBDOMAIN, verifiedAt: new Date() },
      });
      await activeSubscription(tx, { ownerType: "SCHOOL", tenantId: tenant.id }, "SCHOOL_PROFESSIONAL");

      const demo = await seedDemo(tx, tenant.id);

      // Direction
      const directorId = await createUser(tx, argon2, emails.director, "Hissein", "Mahamat");
      await grantTenantRole(tx, directorId, tenant.id, "SCHOOL_OWNER");

      // Enseignant : relié à la première fiche enseignant de démonstration.
      const teacherEmployee = await tx.employee.findFirstOrThrow({
        where: { tenantId: tenant.id, employeeNumber: { startsWith: `${DEMO_MARKER}-ENS-` } },
        orderBy: { employeeNumber: "asc" },
      });
      const teacherId = await createUser(
        tx,
        argon2,
        emails.teacher,
        teacherEmployee.firstName,
        teacherEmployee.lastName,
      );
      await grantTenantRole(tx, teacherId, tenant.id, "TEACHER");
      await tx.employee.update({ where: { id: teacherEmployee.id }, data: { userId: teacherId } });

      // Élève : premier élève de 3e A, avec son propre abonnement.
      const enrollment = await tx.enrollment.findFirstOrThrow({
        where: { tenantId: tenant.id, classroom: { name: "3e A" } },
        include: { student: true },
        orderBy: { student: { matricule: "asc" } },
      });
      const student = enrollment.student;
      const studentUserId = await createUser(tx, argon2, emails.student, student.firstName, student.lastName);
      await tx.studentUserLink.create({
        data: { tenantId: tenant.id, studentId: student.id, userId: studentUserId },
      });
      await activeSubscription(tx, { ownerType: "STUDENT", studentId: student.id }, "STUDENT_BASIC");

      // Parent : tuteur vérifié du même élève, avec l'abonnement familial.
      const parentFirstName = "Ndolassem";
      const parentId = await createUser(tx, argon2, emails.parent, parentFirstName, student.lastName);
      const guardian = await tx.guardian.create({
        data: {
          userId: parentId,
          firstName: parentFirstName,
          lastName: student.lastName,
          email: emails.parent,
        },
      });
      const family = await tx.familyAccount.create({ data: { primaryUserId: parentId, maxChildren: 4 } });
      await tx.familyMember.create({
        data: { familyAccountId: family.id, guardianId: guardian.id, roleInFamily: "PRIMARY" },
      });
      await tx.parentStudentRelationship.create({
        data: {
          parentUserId: parentId,
          studentId: student.id,
          tenantId: tenant.id,
          status: "VERIFIED",
          verifiedAt: new Date(),
        },
      });
      await activeSubscription(tx, { ownerType: "PARENT", familyAccountId: family.id }, "PARENT_BASIC");

      console.log(`Test accounts: created « ${TEST_SCHOOL_NAME} » (identifiant ${TEST_SCHOOL_SUBDOMAIN})`);
      console.log(
        `  demo data: ${Object.entries(demo)
          .map(([label, count]) => `${count} ${label}`)
          .join(", ")}`,
      );
      console.log(`  direction  : ${emails.director}`);
      console.log(
        `  enseignant : ${emails.teacher} (${teacherEmployee.firstName} ${teacherEmployee.lastName})`,
      );
      console.log(`  élève      : ${emails.student} (${student.firstName} ${student.lastName}, 3e A)`);
      console.log(`  parent     : ${emails.parent}`);
      console.log("  passwords: none set — use « Mot de passe oublié ? » for each account");
    },
    { timeout: 240_000, maxWait: 10_000 },
  );
}
