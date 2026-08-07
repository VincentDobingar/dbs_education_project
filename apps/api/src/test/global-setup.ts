import { PrismaClient } from "@prisma/client";

import { TEST_DATABASE_URL } from "./test-database-url.js";

/**
 * Minimal reference data the isolation test suite needs (currency/country/roles/
 * permissions/plans). Deliberately self-contained and separate from
 * prisma/seed/ — tests should not depend on that script having been run, and it
 * seeds far more than these tests exercise.
 */
export default async function setup(): Promise<void> {
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });

  const currency = await prisma.currency.upsert({
    where: { isoCode: "XAF" },
    update: {},
    create: { isoCode: "XAF", nameFr: "Franc CFA", nameEn: "CFA Franc", symbol: "FCFA", decimalDigits: 0 },
  });

  await prisma.country.upsert({
    where: { isoCode: "CM" },
    update: {},
    create: {
      isoCode: "CM",
      nameFr: "Cameroun",
      nameEn: "Cameroon",
      phoneCallingCode: "+237",
      defaultCurrencyId: currency.id,
    },
  });

  const teacherRole = await prisma.role.upsert({
    where: { code: "TEACHER" },
    update: {},
    create: { code: "TEACHER", nameFr: "Enseignant", nameEn: "Teacher", scope: "TENANT" },
  });

  await prisma.role.upsert({
    where: { code: "SCHOOL_ADMIN" },
    update: {},
    create: { code: "SCHOOL_ADMIN", nameFr: "Administrateur", nameEn: "Admin", scope: "TENANT" },
  });

  const studentsReadPermission = await prisma.permission.upsert({
    where: { code: "students.read" },
    update: {},
    create: {
      code: "students.read",
      module: "students",
      descriptionFr: "Consulter les élèves",
      descriptionEn: "View students",
    },
  });

  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: teacherRole.id, permissionId: studentsReadPermission.id } },
    update: {},
    create: { roleId: teacherRole.id, permissionId: studentsReadPermission.id },
  });

  const plans = [
    { code: "SCHOOL_ESSENTIAL", category: "SCHOOL" as const, nameFr: "Essentiel", nameEn: "Essential" },
    { code: "STUDENT_BASIC", category: "STUDENT" as const, nameFr: "Élève", nameEn: "Student" },
    { code: "PARENT_BASIC", category: "PARENT" as const, nameFr: "Parent", nameEn: "Parent" },
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { code: plan.code },
      update: {},
      create: plan,
    });
  }

  await prisma.$disconnect();
}
