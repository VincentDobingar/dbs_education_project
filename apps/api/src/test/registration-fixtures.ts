import { testAdminPrisma } from "./admin-client.js";

/** Prérequis métier explicites pour les anciens scénarios utilisant l'API d'inscription. */
export async function prepareEnrollmentInput<T extends { academicYearId: string }>(
  studentId: string,
  input: T,
): Promise<T & { registrationPeriodId: string }> {
  const student = await testAdminPrisma.student.findUniqueOrThrow({ where: { id: studentId } });
  if (!student.primaryGuardianId) {
    const guardian = await testAdminPrisma.schoolGuardian.create({
      data: {
        tenantId: student.tenantId,
        firstName: "Parent",
        lastName: "Fixture",
        phone: "+237600000000",
      },
    });
    await testAdminPrisma.student.update({
      where: { id: student.id },
      data: { primaryGuardianId: guardian.id },
    });
  }
  const period = await testAdminPrisma.registrationPeriod.upsert({
    where: {
      tenantId_academicYearId_name: {
        tenantId: student.tenantId,
        academicYearId: input.academicYearId,
        name: "Période de test",
      },
    },
    update: {},
    create: {
      tenantId: student.tenantId,
      academicYearId: input.academicYearId,
      name: "Période de test",
      startDate: new Date(Date.now() - 86400000),
      endDate: new Date(Date.now() + 86400000),
      installments: [{ amountCents: 100, dueDate: new Date(Date.now() + 86400000).toISOString() }],
    },
  });
  return { ...input, registrationPeriodId: period.id };
}
