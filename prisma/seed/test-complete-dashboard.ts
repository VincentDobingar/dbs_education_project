/** Contenus pédagogiques locaux relançables, sans notifications externes. */
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient(),
  MARK = "LOCAL-COMPLET";
const round = (x: number) => Math.round(x * 100) / 100;
async function main() {
  const db = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(db.hostname) || !db.pathname.endsWith("_dev"))
    throw new Error("Base locale dev requise");
  await p.$transaction(
    async (tx) => {
      const actor = await tx.user.findUniqueOrThrow({ where: { email: "dobingar.vincent@dbs-africa.org" } });
      const schools = await tx.tenant.findMany({
        where: { domains: { some: { subdomain: { in: ["aurigeo", "ecolevie"] } } }, deletedAt: null },
      });
      for (const school of schools) {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${school.id}, true)`;
        const year = await tx.academicYear.findFirstOrThrow({
          where: { tenantId: school.id, isCurrent: true, deletedAt: null },
        });
        const period = await tx.academicPeriod.findFirstOrThrow({
          where: { tenantId: school.id, academicYearId: year.id },
          orderBy: { sequence: "asc" },
        });
        const registrations = await tx.enrollment.findMany({
          where: {
            tenantId: school.id,
            academicYearId: year.id,
            student: { matricule: { startsWith: "LOCAL-PARCOURS-" } },
            deletedAt: null,
          },
          include: { classroom: true },
        });
        await tx.announcement.upsert({
          where: { id: MARK + "-ANN-" + school.id },
          update: {},
          create: {
            id: MARK + "-ANN-" + school.id,
            tenantId: school.id,
            title: "Bienvenue dans votre espace scolaire (test)",
            body: "Consultez vos cours, préparez vos devoirs et suivez vos résultats. Données de démonstration.",
            audienceScope: "ALL",
            publishedAt: new Date(),
            createdByUserId: actor.id,
          },
        });
        for (const registration of registrations) {
          const classroom = registration.classroom;
          const id = MARK + "-" + classroom.id;
          const coefficients = await tx.subjectCoefficient.findMany({
            where: { tenantId: school.id, gradeLevelId: classroom.gradeLevelId },
            include: { subject: true },
            orderBy: { subject: { code: "asc" } },
          });
          if (!coefficients.length) throw new Error("Matières et coefficients requis");
          const enrolled = await tx.enrollment.findMany({
            where: {
              classroomId: classroom.id,
              academicYearId: year.id,
              deletedAt: null,
              status: { in: ["ENROLLED", "RE_ENROLLED"] },
            },
            orderBy: { studentId: "asc" },
          });
          const teacher = await tx.employee.upsert({
            where: { tenantId_employeeNumber: { tenantId: school.id, employeeNumber: id } },
            update: {},
            create: {
              tenantId: school.id,
              employeeNumber: id,
              firstName: "Enseignant",
              lastName: "Test " + classroom.name,
              jobTitle: "Enseignant de démonstration",
              status: "ACTIVE",
            },
          });
          const room = await tx.room.upsert({
            where: { tenantId_name: { tenantId: school.id, name: "Salle test " + classroom.name } },
            update: {},
            create: {
              tenantId: school.id,
              campusId: classroom.campusId,
              name: "Salle test " + classroom.name,
              capacity: 40,
            },
          });
          const timetable = await tx.timetable.upsert({
            where: { id },
            update: {},
            create: {
              id,
              tenantId: school.id,
              classroomId: classroom.id,
              academicYearId: year.id,
              name: "Emploi du temps de démonstration",
            },
          });
          const type = await tx.assessmentType.findFirstOrThrow({ where: { tenantId: school.id } });
          for (const [index, coefficient] of coefficients.entries()) {
            const subject = coefficient.subject;
            await tx.teacherAssignment.upsert({
              where: {
                employeeId_subjectId_classroomId_academicYearId: {
                  employeeId: teacher.id,
                  subjectId: subject.id,
                  classroomId: classroom.id,
                  academicYearId: year.id,
                },
              },
              update: {},
              create: {
                tenantId: school.id,
                employeeId: teacher.id,
                subjectId: subject.id,
                classroomId: classroom.id,
                academicYearId: year.id,
                hoursPerWeek: 1,
              },
            });
            const day = Math.floor(index / 2) % 5,
              hour = 8 + (index % 2) + Math.floor(index / 10) * 2;
            const start = String(hour).padStart(2, "0") + ":00",
              end = String(hour + 1).padStart(2, "0") + ":00";
            const conflicts = await tx.timetableEntry.count({
              where: {
                tenantId: school.id,
                timetable: { classroomId: classroom.id, academicYearId: year.id },
                dayOfWeek: day,
                startTime: { lt: end },
                endTime: { gt: start },
                NOT: { id: id + "-SLOT-" + index },
              },
            });
            if (!conflicts)
              await tx.timetableEntry.upsert({
                where: { id: id + "-SLOT-" + index },
                update: {},
                create: {
                  id: id + "-SLOT-" + index,
                  tenantId: school.id,
                  timetableId: timetable.id,
                  subjectId: subject.id,
                  teacherEmployeeId: teacher.id,
                  dayOfWeek: day,
                  startTime: start,
                  endTime: end,
                  roomId: room.id,
                  roomLabel: room.name,
                },
              });
            let assessment = await tx.assessment.findFirst({
              where: {
                tenantId: school.id,
                classroomId: classroom.id,
                subjectId: subject.id,
                academicPeriodId: period.id,
                deletedAt: null,
                isPublished: true,
              },
            });
            assessment ??= await tx.assessment.create({
              data: {
                id: id + "-EVAL-" + subject.code,
                tenantId: school.id,
                classroomId: classroom.id,
                subjectId: subject.id,
                academicPeriodId: period.id,
                assessmentTypeId: type.id,
                title: "Contrôle " + subject.nameFr + " (test)",
                maxScore: 20,
                coefficient: 1,
                isPublished: true,
                scheduledAt: new Date(Math.min(Date.now(), period.endDate.getTime())),
              },
            });
            for (const [studentIndex, enrollment] of enrolled.entries())
              await tx.grade.upsert({
                where: {
                  assessmentId_studentId: { assessmentId: assessment.id, studentId: enrollment.studentId },
                },
                update: {},
                create: {
                  tenantId: school.id,
                  assessmentId: assessment.id,
                  studentId: enrollment.studentId,
                  score: 11 + ((index * 3 + studentIndex) % 8),
                  isLocked: true,
                  enteredByEmployeeId: teacher.id,
                  comment: "Évaluation de démonstration",
                },
              });
          }
          for (const [index, subjectCode] of ["MATH", "FR"].entries()) {
            const subject = coefficients.find((c) => c.subject.code === subjectCode)?.subject;
            if (!subject) continue;
            const homeworkId = id + "-DEVOIR-" + subjectCode;
            await tx.homework.upsert({
              where: { id: homeworkId },
              update: {},
              create: {
                id: homeworkId,
                tenantId: school.id,
                classroomId: classroom.id,
                subjectId: subject.id,
                createdByEmployeeId: teacher.id,
                title:
                  subjectCode === "MATH"
                    ? "Fractions et proportionnalité (test)"
                    : "Lecture et expression écrite (test)",
                instructions:
                  subjectCode === "MATH"
                    ? "1. Simplifier 18/24. 2. Calculer 3/4 + 2/3. 3. Un cahier coûte 450 unités : calculer le prix de 8 cahiers. Justifier chaque étape."
                    : "Rédiger un texte de 120 mots sur la vie de votre établissement. Identifier deux verbes au présent et proposer un titre.",
                dueAt: new Date(Date.now() + (index + 4) * 86400000),
              },
            });
            const courseId = id + "-COURS-" + subjectCode;
            await tx.onlineCourse.upsert({
              where: { id: courseId },
              update: {},
              create: {
                id: courseId,
                tenantId: school.id,
                classroomId: classroom.id,
                subjectId: subject.id,
                createdByEmployeeId: teacher.id,
                title: subjectCode === "MATH" ? "Comprendre les fractions" : "Organiser un paragraphe",
                description: "Cours et exercices de démonstration à consulter puis marquer comme terminés.",
              },
            });
            for (let resourceIndex = 0; resourceIndex < 2; resourceIndex++)
              await tx.courseResource.upsert({
                where: { id: courseId + "-" + resourceIndex },
                update: {},
                create: {
                  id: courseId + "-" + resourceIndex,
                  tenantId: school.id,
                  courseId: courseId,
                  title: resourceIndex === 0 ? "Leçon et exemple corrigé" : "Exercice d'application",
                  type: "TEXT",
                  order: resourceIndex,
                  content:
                    subjectCode === "MATH"
                      ? resourceIndex === 0
                        ? "Une fraction représente une part d'un tout. Pour additionner deux fractions, utiliser un dénominateur commun. Exemple : 1/2 + 1/3 = 3/6 + 2/6 = 5/6."
                        : "Calculer 2/5 + 1/4, puis simplifier 12/18. Vérifier : 2/5 + 1/4 = 13/20 et 12/18 = 2/3."
                      : resourceIndex === 0
                        ? "Un paragraphe développe une idée principale. Commencer par une phrase qui annonce cette idée, ajouter un exemple et terminer par une conclusion."
                        : "Écrire cinq phrases sur une activité scolaire. Souligner l'idée principale et relier les phrases avec d'abord, ensuite et enfin.",
                },
              });
          }
          await tx.announcement.upsert({
            where: { id: id + "-ANN" },
            update: {},
            create: {
              id: id + "-ANN",
              tenantId: school.id,
              classroomId: classroom.id,
              title: "Préparation des évaluations - " + classroom.name,
              body: "Les devoirs de français et de mathématiques sont disponibles. Consultez les ressources avant de remettre votre travail.",
              audienceScope: "CLASSROOM",
              publishedAt: new Date(),
              createdByUserId: actor.id,
            },
          });
          const assessments = await tx.assessment.findMany({
            where: {
              classroomId: classroom.id,
              academicPeriodId: period.id,
              deletedAt: null,
              isPublished: true,
            },
          });
          const grades = await tx.grade.findMany({
            where: {
              studentId: { in: enrolled.map((e) => e.studentId) },
              assessmentId: { in: assessments.map((a) => a.id) },
              isAbsent: false,
              score: { not: null },
            },
          });
          const cards = [];
          for (const enrollment of enrolled) {
            const items = [];
            for (const coefficient of coefficients) {
              const measures = grades.flatMap((grade) => {
                const assessment = assessments.find(
                  (a) => a.id === grade.assessmentId && a.subjectId === coefficient.subjectId,
                );
                return assessment &&
                  grade.studentId === enrollment.studentId &&
                  Number(assessment.maxScore) > 0
                  ? [
                      {
                        score: (Number(grade.score) / Number(assessment.maxScore)) * 20,
                        weight: Number(assessment.coefficient),
                      },
                    ]
                  : [];
              });
              const weight = measures.reduce((s, m) => s + m.weight, 0);
              if (weight)
                items.push({
                  subjectId: coefficient.subjectId,
                  averageScore: round(measures.reduce((s, m) => s + m.score * m.weight, 0) / weight),
                  coefficient: Number(coefficient.coefficient),
                });
            }
            const total = items.reduce((s, item) => s + item.coefficient, 0);
            cards.push({
              studentId: enrollment.studentId,
              items,
              average: total
                ? round(items.reduce((s, item) => s + item.averageScore * item.coefficient, 0) / total)
                : null,
            });
          }
          const sorted = cards.filter((c) => c.average !== null).sort((a, b) => b.average! - a.average!);
          for (const card of cards) {
            const rank =
              card.average === null ? null : sorted.findIndex((c) => c.average === card.average) + 1;
            const values = {
              averageScore: card.average,
              classRank: rank,
              mention:
                card.average === null
                  ? null
                  : card.average >= 16
                    ? "Très bien"
                    : card.average >= 14
                      ? "Bien"
                      : card.average >= 12
                        ? "Assez bien"
                        : card.average >= 10
                          ? "Passable"
                          : "Encouragements",
              generatedAt: new Date(),
            };
            const report = await tx.reportCard.upsert({
              where: {
                studentId_academicPeriodId: { studentId: card.studentId, academicPeriodId: period.id },
              },
              update: values,
              create: {
                tenantId: school.id,
                studentId: card.studentId,
                academicPeriodId: period.id,
                ...values,
              },
            });
            await tx.reportCardItem.deleteMany({ where: { reportCardId: report.id } });
            await tx.reportCardItem.createMany({
              data: card.items.map((item) => ({ reportCardId: report.id, ...item })),
            });
          }
          console.log(
            JSON.stringify({
              etablissement: school.name,
              classe: classroom.name,
              matieres: coefficients.length,
              eleves: enrolled.length,
              devoirs: 2,
              cours: 2,
            }),
          );
        }
      }
    },
    { timeout: 120000 },
  );
}
main()
  .catch((e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void p.$disconnect());
