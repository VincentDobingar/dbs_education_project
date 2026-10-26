/**
 * Complète uniquement LOCAL-PARCOURS dans la base locale.
 * Paiements fictifs : aucune intégration bancaire ni notification.
 */
import { PrismaClient, type AttendanceStatus } from "@prisma/client";
const p = new PrismaClient();
const MARKER = "LOCAL-PARCOURS";
async function main() {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL!).hostname))
    throw new Error("Base locale uniquement");
  await p.$transaction(
    async (tx) => {
      const demoSubscriptions = await tx.subscription.findMany({
        where: { id: { startsWith: MARKER }, status: "ACTIVE", deletedAt: null },
        include: { plan: { include: { features: true } } },
      });
      for (const subscription of demoSubscriptions) {
        for (const feature of subscription.plan.features) {
          await tx.entitlement.upsert({
            where: {
              subscriptionId_featureCode: {
                subscriptionId: subscription.id,
                featureCode: feature.featureCode,
              },
            },
            update: {},
            create: {
              subscriptionId: subscription.id,
              featureCode: feature.featureCode,
              isEnabled: feature.isIncluded,
              quotaLimit: feature.quotaLimit,
              expiresAt: subscription.currentPeriodEndsAt,
            },
          });
        }
      }
      const actor = await tx.user.findUniqueOrThrow({ where: { email: "dobingar.vincent@dbs-africa.org" } });
      const tenants = await tx.tenant.findMany({
        where: { deletedAt: null, domains: { some: { subdomain: { in: ["aurigeo", "ecolevie"] } } } },
      });
      for (const tenant of tenants) {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;
        const year = await tx.academicYear.findFirstOrThrow({
          where: { tenantId: tenant.id, isCurrent: true, deletedAt: null },
        });
        const period = await tx.academicPeriod.findFirstOrThrow({
          where: { tenantId: tenant.id, academicYearId: year.id },
          orderBy: { sequence: "asc" },
        });
        const assessmentType = await tx.assessmentType.findFirstOrThrow({ where: { tenantId: tenant.id } });
        const employee = await tx.employee.upsert({
          where: { tenantId_employeeNumber: { tenantId: tenant.id, employeeNumber: MARKER + "-CAISSE" } },
          update: {},
          create: {
            tenantId: tenant.id,
            userId: actor.id,
            employeeNumber: MARKER + "-CAISSE",
            firstName: "Agent",
            lastName: "Test local",
            jobTitle: "Agent de caisse de démonstration",
            status: "ACTIVE",
          },
        });
        const subjects = await tx.subject.findMany({
          where: { tenantId: tenant.id, code: { in: ["FR", "MATH"] } },
          orderBy: { code: "asc" },
        });
        if (subjects.length !== 2) throw new Error("Matières FR/MATH manquantes");
        const students = await tx.student.findMany({
          where: {
            tenantId: tenant.id,
            matricule: { in: [1, 2, 3].map((i) => MARKER + "-" + i) },
            deletedAt: null,
          },
          orderBy: { matricule: "asc" },
        });
        if (students.length !== 3) throw new Error("Créer les familles de test d'abord");
        for (const [studentIndex, student] of students.entries()) {
          const enrollment = await tx.enrollment.findUniqueOrThrow({
            where: { studentId_academicYearId: { studentId: student.id, academicYearId: year.id } },
          });
          const scores = [studentIndex === 0 ? 16 : 13, studentIndex === 0 ? 14 : 15];
          const reportItems = [];
          for (const [index, subject] of subjects.entries()) {
            const assessmentId =
              MARKER + "-ASSESS-" + enrollment.classroomId + "-" + period.id + "-" + subject.code;
            const assessment = await tx.assessment.upsert({
              where: { id: assessmentId },
              update: {},
              create: {
                id: assessmentId,
                tenantId: tenant.id,
                subjectId: subject.id,
                classroomId: enrollment.classroomId,
                assessmentTypeId: assessmentType.id,
                academicPeriodId: period.id,
                title: MARKER + " — contrôle " + subject.nameFr,
                maxScore: 20,
                coefficient: 1,
                scheduledAt: new Date(Math.min(Date.now(), period.endDate.getTime())),
                isPublished: true,
              },
            });
            await tx.grade.upsert({
              where: { assessmentId_studentId: { assessmentId: assessment.id, studentId: student.id } },
              update: {},
              create: {
                tenantId: tenant.id,
                assessmentId: assessment.id,
                studentId: student.id,
                score: scores[index]!,
                isLocked: true,
                enteredByEmployeeId: employee.id,
                comment: "Donnée de démonstration — bon travail",
              },
            });
            const coefficient = await tx.subjectCoefficient.findUnique({
              where: {
                subjectId_gradeLevelId: { subjectId: subject.id, gradeLevelId: enrollment.gradeLevelId },
              },
            });
            reportItems.push({
              subjectId: subject.id,
              averageScore: scores[index]!,
              coefficient: Number(coefficient?.coefficient ?? 1),
              teacherComment: "Résultat de test, poursuivre les efforts.",
            });
          }
          const total = reportItems.reduce((sum, item) => sum + item.averageScore * item.coefficient, 0);
          const weight = reportItems.reduce((sum, item) => sum + item.coefficient, 0);
          const average = Math.round((total / weight) * 100) / 100;
          await tx.reportCard.upsert({
            where: { studentId_academicPeriodId: { studentId: student.id, academicPeriodId: period.id } },
            update: {},
            create: {
              tenantId: tenant.id,
              studentId: student.id,
              academicPeriodId: period.id,
              averageScore: average,
              mention: average >= 16 ? "Très bien" : average >= 14 ? "Bien" : "Assez bien",
              items: { create: reportItems },
            },
          });
          const statuses: AttendanceStatus[] = ["PRESENT", "ABSENT", "EXCUSED", "LATE", "PRESENT"];
          const base = Math.max(
            year.startDate.getTime(),
            Math.min(Date.now(), year.endDate.getTime()) - 6 * 86400000,
          );
          for (const [index, status] of statuses.entries()) {
            const attendanceId = MARKER + "-ATT-" + student.id + "-" + year.id + "-" + index;
            await tx.attendance.upsert({
              where: { id: attendanceId },
              update: {},
              create: {
                id: attendanceId,
                tenantId: tenant.id,
                studentId: student.id,
                classroomId: enrollment.classroomId,
                date: new Date(base + index * 86400000),
                status,
                recordedByEmployeeId: employee.id,
                justificationNote:
                  status === "EXCUSED"
                    ? "Absence justifiée : rendez-vous médical (test)"
                    : status === "LATE"
                      ? "Retard de 15 minutes (test)"
                      : status === "ABSENT"
                        ? "Absence non justifiée (test)"
                        : "Présence (test)",
              },
            });
          }
          for (let index = 0; index < 2; index++) {
            const invoice = await tx.studentInvoice.findUniqueOrThrow({
              where: {
                tenantId_number: { tenantId: tenant.id, number: `INS-${enrollment.id}-${index + 1}` },
              },
            });
            const paymentId = MARKER + "-PAY-" + invoice.id;
            if (await tx.studentPayment.findUnique({ where: { id: paymentId } })) continue;
            // Ne pas mélanger un encaissement manuel déjà saisi avec les fixtures.
            if (
              invoice.paidCents !== 0 ||
              (await tx.studentPayment.count({ where: { studentInvoiceId: invoice.id } }))
            )
              continue;
            const amount = index === 0 ? invoice.totalCents : Math.floor(invoice.totalCents / 2);
            if (invoice.status === "CANCELLED" || invoice.status === "DRAFT") continue;
            await tx.studentPayment.create({
              data: {
                id: paymentId,
                tenantId: tenant.id,
                studentInvoiceId: invoice.id,
                amountCents: amount,
                method: "CASH",
                recordedByEmployeeId: employee.id,
                receipt: { create: { tenantId: tenant.id, number: MARKER + "-REC-" + invoice.id } },
              },
            });
            await tx.studentInvoice.update({
              where: { id: invoice.id },
              data: { paidCents: amount, status: amount === invoice.totalCents ? "PAID" : "PARTIALLY_PAID" },
            });
            await tx.auditLog.create({
              data: {
                tenantId: tenant.id,
                actorUserId: actor.id,
                action: "LOCAL_TEST_PAYMENT_CREATED",
                entityType: "StudentPayment",
                entityId: paymentId,
              },
            });
          }
        }
        console.log(
          JSON.stringify({
            etablissement: tenant.name,
            eleves: students.length,
            notes: 6,
            bulletins: 3,
            presencesAbsences: 15,
            paiements: 6,
            recus: 6,
          }),
        );
      }
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
