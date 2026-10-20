/**
 * Données de démonstration pour UN établissement : structure (année, niveaux CP1 →
 * Terminale, classes, matières, salles), 100 élèves inscrits, 24 membres du
 * personnel, affectations enseignant × matière × classe et emplois du temps sans
 * conflit.
 *
 * Usage (connexion PROPRIÉTAIRE de la base — contourne la RLS, comme le seed) :
 *   DATABASE_URL=<url propriétaire> tsx prisma/seed/demo/demo-school.ts --tenant=<sous-domaine ou nom>
 *   … --dry-run   : exécute tout dans une transaction puis l'annule (validation sans écriture)
 *   … --cleanup   : retire uniquement les données marquées DEMO (élèves, personnel, cours)
 *
 * Tout est écrit dans UNE transaction : en cas d'erreur, rien n'est conservé.
 * Refuse de s'exécuter si des élèves DEMO existent déjà dans l'établissement.
 */
import { Prisma, PrismaClient } from "@prisma/client";

import {
  buildStudents,
  buildTimetable,
  createRandom,
  DEMO_MARKER,
  LEVELS,
  STAFF,
  SUBJECT_CODES,
  TEACHERS,
  teacherFor,
} from "./plan.js";

const prisma = new PrismaClient();
type Tx = Prisma.TransactionClient;

const TIMETABLE_SUFFIX = "(démo)";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}
const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

class DryRunRollback extends Error {}

async function resolveTenant(query: string): Promise<{ id: string; name: string }> {
  const byDomain = await prisma.tenantDomain.findUnique({
    where: { subdomain: query },
    include: { tenant: true },
  });
  if (byDomain) return { id: byDomain.tenant.id, name: byDomain.tenant.name };

  const matches = await prisma.tenant.findMany({
    where: { name: { contains: query, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (matches.length === 1) return matches[0]!;
  const all = await prisma.tenant.findMany({
    select: { name: true, domains: { select: { subdomain: true } } },
  });
  console.error(
    `Établissement introuvable ou ambigu pour « ${query} ». Disponibles :\n` +
      all
        .map((tenant) => `  - ${tenant.name} (${tenant.domains.map((d) => d.subdomain).join(", ")})`)
        .join("\n"),
  );
  process.exit(1);
}

async function catalogItem(tx: Tx, kind: "EDUCATION_CYCLE" | "GRADE_LEVEL" | "SUBJECT", code: string) {
  const item = await tx.catalogItem.findUnique({ where: { kind_code: { kind, code } } });
  if (!item) throw new Error(`Élément de catalogue manquant : ${kind} ${code} (lancer le seed principal)`);
  return item;
}

async function ensureStructure(tx: Tx, tenantId: string) {
  // Année scolaire : l'année en cours, sinon 2026-2027 (créée et mise en cours).
  let year =
    (await tx.academicYear.findFirst({ where: { tenantId, isCurrent: true, deletedAt: null } })) ??
    (await tx.academicYear.findFirst({ where: { tenantId, name: "2026-2027", deletedAt: null } }));
  if (!year) {
    year = await tx.academicYear.create({
      data: {
        tenantId,
        name: "2026-2027",
        startDate: new Date("2026-10-01T00:00:00Z"),
        endDate: new Date("2027-06-30T00:00:00Z"),
        isCurrent: true,
      },
    });
  }

  let campus =
    (await tx.campus.findFirst({ where: { tenantId, isMain: true, deletedAt: null } })) ??
    (await tx.campus.findFirst({ where: { tenantId, deletedAt: null }, orderBy: { createdAt: "asc" } }));
  if (!campus) {
    campus = await tx.campus.create({
      data: { tenantId, code: "PRINCIPAL", name: "Campus principal", isMain: true },
    });
  }

  const cycles = new Map<string, string>();
  for (const code of ["PRIM", "MOYEN", "SEC"]) {
    let cycle = await tx.educationCycle.findFirst({ where: { tenantId, code } });
    if (!cycle) {
      const item = await catalogItem(tx, "EDUCATION_CYCLE", code);
      cycle = await tx.educationCycle.create({
        data: { tenantId, code, nameFr: item.nameFr, nameEn: item.nameEn, order: item.order },
      });
    }
    cycles.set(code, cycle.id);
  }

  const subjects = new Map<string, string>();
  for (const code of SUBJECT_CODES) {
    let subject = await tx.subject.findFirst({ where: { tenantId, code } });
    if (!subject) {
      const item = await catalogItem(tx, "SUBJECT", code);
      subject = await tx.subject.create({
        data: { tenantId, code, nameFr: item.nameFr, nameEn: item.nameEn },
      });
    }
    subjects.set(code, subject.id);
  }

  const levels = new Map<string, { gradeLevelId: string; classroomId: string; roomId: string }>();
  let roomNumber = 0;
  for (const level of LEVELS) {
    let gradeLevel = await tx.gradeLevel.findFirst({ where: { tenantId, code: level.code } });
    if (!gradeLevel) {
      const item = await catalogItem(tx, "GRADE_LEVEL", level.code);
      gradeLevel = await tx.gradeLevel.create({
        data: {
          tenantId,
          cycleId: cycles.get(level.cycleCode)!,
          code: level.code,
          nameFr: item.nameFr,
          nameEn: item.nameEn,
          order: item.order,
        },
      });
    }

    let classroom =
      (await tx.classroom.findFirst({
        where: { tenantId, academicYearId: year.id, gradeLevelId: gradeLevel.id, deletedAt: null },
        orderBy: { name: "asc" },
      })) ??
      (await tx.classroom.findFirst({ where: { tenantId, academicYearId: year.id, name: level.className } }));
    if (!classroom) {
      classroom = await tx.classroom.create({
        data: {
          tenantId,
          academicYearId: year.id,
          campusId: campus.id,
          gradeLevelId: gradeLevel.id,
          name: level.className,
          capacity: 40,
        },
      });
    }

    roomNumber += 1;
    const roomName = `Salle ${roomNumber}`;
    let room = await tx.room.findFirst({ where: { tenantId, name: roomName } });
    if (!room) {
      room = await tx.room.create({ data: { tenantId, name: roomName, campusId: campus.id, capacity: 40 } });
    }

    for (const [subjectCode, coefficient] of Object.entries(level.coefficients ?? {})) {
      const subjectId = subjects.get(subjectCode)!;
      const existing = await tx.subjectCoefficient.findUnique({
        where: { subjectId_gradeLevelId: { subjectId, gradeLevelId: gradeLevel.id } },
      });
      if (!existing) {
        await tx.subjectCoefficient.create({
          data: { tenantId, subjectId, gradeLevelId: gradeLevel.id, coefficient },
        });
      }
    }

    levels.set(level.code, { gradeLevelId: gradeLevel.id, classroomId: classroom.id, roomId: room.id });
  }

  return { year, campus, subjects, levels };
}

async function seedDemo(tx: Tx, tenantId: string): Promise<Record<string, number>> {
  const { year, campus, subjects, levels } = await ensureStructure(tx, tenantId);
  const schoolYearStart = year.startDate.getUTCFullYear();
  const random = createRandom(schoolYearStart);

  // Personnel
  const employeeIds = new Map<string, string>();
  const hireDate = new Date(Date.UTC(schoolYearStart, 8, 15));
  for (const person of [...TEACHERS, ...STAFF]) {
    const employee = await tx.employee.create({
      data: {
        tenantId,
        employeeNumber: person.number,
        firstName: person.firstName,
        lastName: person.lastName,
        jobTitle: person.jobTitle,
        hireDate,
        status: "ACTIVE",
      },
    });
    employeeIds.set(person.number, employee.id);
  }

  // Élèves + inscriptions
  const students = buildStudents(schoolYearStart, random);
  for (const student of students) {
    const level = levels.get(student.levelCode)!;
    const created = await tx.student.create({
      data: {
        tenantId,
        matricule: student.matricule,
        firstName: student.firstName,
        lastName: student.lastName,
        gender: student.gender,
        dateOfBirth: new Date(`${student.dateOfBirth}T00:00:00Z`),
        emergencyContactName: student.emergencyContactName,
        emergencyContactPhone: student.emergencyContactPhone,
        status: "ACTIVE",
      },
    });
    await tx.enrollment.create({
      data: {
        tenantId,
        studentId: created.id,
        academicYearId: year.id,
        classroomId: level.classroomId,
        campusId: campus.id,
        gradeLevelId: level.gradeLevelId,
        status: "ENROLLED",
        enrolledAt: year.startDate,
      },
    });
  }

  // Affectations enseignant × matière × classe
  let assignments = 0;
  for (const level of LEVELS) {
    for (const [subjectCode, hours] of Object.entries(level.hours)) {
      await tx.teacherAssignment.create({
        data: {
          tenantId,
          employeeId: employeeIds.get(teacherFor(subjectCode, level.code).number)!,
          subjectId: subjects.get(subjectCode)!,
          classroomId: levels.get(level.code)!.classroomId,
          academicYearId: year.id,
          hoursPerWeek: hours,
        },
      });
      assignments += 1;
    }
  }

  // Emplois du temps
  const lessons = buildTimetable(random);
  for (const level of LEVELS) {
    const target = levels.get(level.code)!;
    const timetable = await tx.timetable.create({
      data: {
        tenantId,
        classroomId: target.classroomId,
        academicYearId: year.id,
        name: `Emploi du temps ${year.name} ${TIMETABLE_SUFFIX}`,
      },
    });
    await tx.timetableEntry.createMany({
      data: lessons
        .filter((lesson) => lesson.levelCode === level.code)
        .map((lesson) => ({
          tenantId,
          timetableId: timetable.id,
          subjectId: subjects.get(lesson.subject)!,
          teacherEmployeeId: employeeIds.get(lesson.teacherNumber)!,
          dayOfWeek: lesson.slot.dayOfWeek,
          startTime: lesson.slot.startTime,
          endTime: lesson.slot.endTime,
          roomId: target.roomId,
        })),
    });
  }

  return {
    élèves: students.length,
    inscriptions: students.length,
    enseignants: TEACHERS.length,
    administratifs: STAFF.length,
    affectations: assignments,
    "emplois du temps": LEVELS.length,
    "heures de cours": lessons.length,
  };
}

async function cleanupDemo(tx: Tx, tenantId: string): Promise<Record<string, number>> {
  const employees = await tx.employee.findMany({
    where: { tenantId, employeeNumber: { startsWith: `${DEMO_MARKER}-` } },
    select: { id: true },
  });
  const employeeIds = employees.map((employee) => employee.id);
  const students = await tx.student.findMany({
    where: { tenantId, matricule: { startsWith: `${DEMO_MARKER}-` } },
    select: { id: true },
  });
  const studentIds = students.map((student) => student.id);

  const entries = await tx.timetableEntry.deleteMany({
    where: { tenantId, teacherEmployeeId: { in: employeeIds } },
  });
  const timetables = await tx.timetable.deleteMany({
    where: { tenantId, name: { endsWith: TIMETABLE_SUFFIX }, entries: { none: {} } },
  });
  const assignments = await tx.teacherAssignment.deleteMany({
    where: { tenantId, employeeId: { in: employeeIds } },
  });
  const enrollments = await tx.enrollment.deleteMany({ where: { tenantId, studentId: { in: studentIds } } });
  const removedStudents = await tx.student.deleteMany({ where: { id: { in: studentIds } } });
  const removedEmployees = await tx.employee.deleteMany({ where: { id: { in: employeeIds } } });

  return {
    "heures de cours": entries.count,
    "emplois du temps": timetables.count,
    affectations: assignments.count,
    inscriptions: enrollments.count,
    élèves: removedStudents.count,
    personnel: removedEmployees.count,
  };
}

async function main(): Promise<void> {
  const query = arg("tenant");
  if (!query) {
    console.error("Préciser l'établissement : --tenant=<sous-domaine ou nom>");
    process.exit(1);
  }
  const dryRun = hasFlag("dry-run");
  const cleanup = hasFlag("cleanup");
  const tenant = await resolveTenant(query);
  console.log(`Établissement : ${tenant.name}${dryRun ? " — DRY RUN (aucune écriture conservée)" : ""}`);

  if (!cleanup) {
    const existing = await prisma.student.count({
      where: { tenantId: tenant.id, matricule: { startsWith: `${DEMO_MARKER}-` } },
    });
    if (existing > 0) {
      console.error(`${existing} élèves de démonstration existent déjà. Lancer d'abord --cleanup.`);
      process.exit(1);
    }
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        const summary = cleanup ? await cleanupDemo(tx, tenant.id) : await seedDemo(tx, tenant.id);
        console.log(cleanup ? "Supprimé :" : "Créé :");
        for (const [label, count] of Object.entries(summary)) console.log(`  ${label} : ${count}`);
        if (dryRun) throw new DryRunRollback();
      },
      { timeout: 180_000, maxWait: 10_000 },
    );
    console.log("Terminé.");
  } catch (error) {
    if (error instanceof DryRunRollback) {
      console.log("Dry run : transaction annulée, rien n'a été écrit.");
      return;
    }
    throw error;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
