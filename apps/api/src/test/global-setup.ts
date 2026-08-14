import { PrismaClient } from "@prisma/client";

import { TEST_DATABASE_URL } from "./test-database-url.js";

/**
 * Minimal reference data the isolation test suite needs (currency/country/roles/
 * permissions/plans/prices/providers). Deliberately self-contained and separate
 * from prisma/seed/ — tests should not depend on that script having been run, and
 * it seeds far more than these tests exercise.
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

  const schoolOwnerRole = await prisma.role.upsert({
    where: { code: "SCHOOL_OWNER" },
    update: {},
    create: { code: "SCHOOL_OWNER", nameFr: "Propriétaire", nameEn: "Owner", scope: "TENANT" },
  });

  // §31 : rôles plateforme, portée nulle (tenantId: null côté UserRole).
  await prisma.role.upsert({
    where: { code: "SUPER_ADMIN" },
    update: {},
    create: { code: "SUPER_ADMIN", nameFr: "Super administrateur", nameEn: "Super Admin", scope: "PLATFORM" },
  });
  await prisma.role.upsert({
    where: { code: "PLATFORM_ADMIN" },
    update: {},
    create: {
      code: "PLATFORM_ADMIN",
      nameFr: "Administrateur plateforme",
      nameEn: "Platform Admin",
      scope: "PLATFORM",
    },
  });
  await prisma.role.upsert({
    where: { code: "PLATFORM_AUDITOR" },
    update: {},
    create: {
      code: "PLATFORM_AUDITOR",
      nameFr: "Auditeur plateforme",
      nameEn: "Platform Auditor",
      scope: "PLATFORM",
    },
  });
  await prisma.role.upsert({
    where: { code: "SUPPORT_AGENT" },
    update: {},
    create: {
      code: "SUPPORT_AGENT",
      nameFr: "Agent support",
      nameEn: "Support Agent",
      scope: "PLATFORM",
    },
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

  const subscriptionsManagePermission = await prisma.permission.upsert({
    where: { code: "subscriptions.manage" },
    update: {},
    create: {
      code: "subscriptions.manage",
      module: "billing",
      descriptionFr: "Gérer les abonnements",
      descriptionEn: "Manage subscriptions",
    },
  });

  const financeWritePermission = await prisma.permission.upsert({
    where: { code: "finance.write" },
    update: {},
    create: {
      code: "finance.write",
      module: "finance",
      descriptionFr: "Gérer les finances",
      descriptionEn: "Manage finances",
    },
  });

  const financeReadPermission = await prisma.permission.upsert({
    where: { code: "finance.read" },
    update: {},
    create: {
      code: "finance.read",
      module: "finance",
      descriptionFr: "Consulter les finances",
      descriptionEn: "View finances",
    },
  });

  const tenantSettingsManagePermission = await prisma.permission.upsert({
    where: { code: "tenant.settings.manage" },
    update: {},
    create: {
      code: "tenant.settings.manage",
      module: "tenant",
      descriptionFr: "Gérer les paramètres de l'établissement",
      descriptionEn: "Manage school settings",
    },
  });

  const hrManagePermission = await prisma.permission.upsert({
    where: { code: "hr.manage" },
    update: {},
    create: {
      code: "hr.manage",
      module: "hr",
      descriptionFr: "Gérer le personnel",
      descriptionEn: "Manage staff",
    },
  });

  const studentsWritePermission = await prisma.permission.upsert({
    where: { code: "students.write" },
    update: {},
    create: {
      code: "students.write",
      module: "students",
      descriptionFr: "Gérer les élèves",
      descriptionEn: "Manage students",
    },
  });

  const gradesReadPermission = await prisma.permission.upsert({
    where: { code: "grades.read" },
    update: {},
    create: {
      code: "grades.read",
      module: "grades",
      descriptionFr: "Consulter les notes",
      descriptionEn: "View grades",
    },
  });

  const gradesWritePermission = await prisma.permission.upsert({
    where: { code: "grades.write" },
    update: {},
    create: {
      code: "grades.write",
      module: "grades",
      descriptionFr: "Saisir les notes",
      descriptionEn: "Enter grades",
    },
  });

  const gradesPublishPermission = await prisma.permission.upsert({
    where: { code: "grades.publish" },
    update: {},
    create: {
      code: "grades.publish",
      module: "grades",
      descriptionFr: "Publier les bulletins",
      descriptionEn: "Publish report cards",
    },
  });

  const attendanceReadPermission = await prisma.permission.upsert({
    where: { code: "attendance.read" },
    update: {},
    create: {
      code: "attendance.read",
      module: "attendance",
      descriptionFr: "Consulter les présences",
      descriptionEn: "View attendance",
    },
  });

  const attendanceWritePermission = await prisma.permission.upsert({
    where: { code: "attendance.write" },
    update: {},
    create: {
      code: "attendance.write",
      module: "attendance",
      descriptionFr: "Saisir les présences",
      descriptionEn: "Record attendance",
    },
  });

  const disciplineReadPermission = await prisma.permission.upsert({
    where: { code: "discipline.read" },
    update: {},
    create: {
      code: "discipline.read",
      module: "discipline",
      descriptionFr: "Consulter les incidents disciplinaires",
      descriptionEn: "View disciplinary incidents",
    },
  });

  const disciplineWritePermission = await prisma.permission.upsert({
    where: { code: "discipline.write" },
    update: {},
    create: {
      code: "discipline.write",
      module: "discipline",
      descriptionFr: "Gérer les incidents disciplinaires",
      descriptionEn: "Manage disciplinary incidents",
    },
  });

  const communicationManagePermission = await prisma.permission.upsert({
    where: { code: "communication.manage" },
    update: {},
    create: {
      code: "communication.manage",
      module: "communication",
      descriptionFr: "Gérer les annonces",
      descriptionEn: "Manage announcements",
    },
  });

  for (const permission of [
    studentsReadPermission,
    gradesReadPermission,
    gradesWritePermission,
    attendanceReadPermission,
    attendanceWritePermission,
    disciplineReadPermission,
    disciplineWritePermission,
  ]) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: teacherRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: teacherRole.id, permissionId: permission.id },
    });
  }

  for (const permission of [
    subscriptionsManagePermission,
    financeWritePermission,
    financeReadPermission,
    tenantSettingsManagePermission,
    hrManagePermission,
    studentsReadPermission,
    studentsWritePermission,
    gradesReadPermission,
    gradesPublishPermission,
    attendanceReadPermission,
    disciplineReadPermission,
    communicationManagePermission,
  ]) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: schoolOwnerRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: schoolOwnerRole.id, permissionId: permission.id },
    });
  }

  const schoolAdminRole = await prisma.role.findUniqueOrThrow({ where: { code: "SCHOOL_ADMIN" } });
  for (const permission of [
    tenantSettingsManagePermission,
    studentsReadPermission,
    studentsWritePermission,
  ]) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: schoolAdminRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: schoolAdminRole.id, permissionId: permission.id },
    });
  }

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

  const schoolEssential = await prisma.subscriptionPlan.findUniqueOrThrow({
    where: { code: "SCHOOL_ESSENTIAL" },
  });

  const existingPrice = await prisma.planPrice.findFirst({
    where: { planId: schoolEssential.id, countryId: null, currencyId: currency.id, billingPeriod: "MONTHLY" },
  });
  if (!existingPrice) {
    await prisma.planPrice.create({
      data: {
        planId: schoolEssential.id,
        currencyId: currency.id,
        billingPeriod: "MONTHLY",
        amountCents: 25_000,
      },
    });
  }

  await prisma.planFeature.upsert({
    where: { planId_featureCode: { planId: schoolEssential.id, featureCode: "report_card.download" } },
    update: { isIncluded: true, quotaLimit: null },
    create: {
      planId: schoolEssential.id,
      featureCode: "report_card.download",
      isIncluded: true,
      quotaLimit: null,
    },
  });

  await prisma.paymentProvider.upsert({
    where: { code: "CASH_AGENT" },
    update: {},
    create: {
      code: "CASH_AGENT",
      nameFr: "Espèces (agent autorisé)",
      nameEn: "Cash (authorized agent)",
      methodType: "CASH",
      isTestMode: true,
    },
  });

  await prisma.$disconnect();
}
