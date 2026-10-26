/**
 * R�f�rentiels locaux uniquement. Relan�able sans �craser les personnalisations.
 * node --env-file=.env --import tsx prisma/seed/school-basics.ts --all
 * ou --tenant=<id>. PostgreSQL local uniquement, transaction/RLS par �tablissement.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { LEVELS, SUBJECT_CODES } from "./demo/plan.js";
import { CATALOG_ITEMS } from "./data/catalog.js";
const prisma = new PrismaClient();
type Tx = Prisma.TransactionClient;
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

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Base locale requise");
  const tenantId = process.argv.find((x) => x.startsWith("--tenant="))?.slice(9);
  if (!tenantId && !process.argv.includes("--all")) throw new Error("Pr�ciser --tenant=<id> ou --all");
  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null, ...(tenantId ? { id: tenantId } : {}) },
    select: { id: true, name: true },
  });
  if (!tenants.length) throw new Error("Aucun �tablissement trouv�");
  for (const tenant of tenants) {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant.id}, true)`;
        for (const item of CATALOG_ITEMS) {
          await tx.catalogItem.upsert({
            where: { kind_code: { kind: item.kind, code: item.code } },
            update: {},
            create: item,
          });
        }
        const { year, levels } = await ensureStructure(tx, tenant.id);
        if (
          (await tx.academicPeriod.count({ where: { tenantId: tenant.id, academicYearId: year.id } })) === 0
        ) {
          const start = year.startDate.getTime(),
            end = year.endDate.getTime();
          for (let i = 0; i < 3; i++)
            await tx.academicPeriod.create({
              data: {
                tenantId: tenant.id,
                academicYearId: year.id,
                name: `Trimestre ${i + 1}`,
                type: "TRIMESTER",
                sequence: i + 1,
                startDate: new Date(start + Math.floor(((end - start) * i) / 3)),
                endDate: new Date(i === 2 ? end : start + Math.floor(((end - start) * (i + 1)) / 3) - 1),
              },
            });
        }
        for (const item of CATALOG_ITEMS.filter(
          (x) => x.kind === "ASSESSMENT_TYPE" || x.kind === "FEE_CATEGORY",
        )) {
          const data = { tenantId: tenant.id, code: item.code, nameFr: item.nameFr, nameEn: item.nameEn };
          const where = { tenantId_code: { tenantId: tenant.id, code: item.code } };
          if (item.kind === "ASSESSMENT_TYPE")
            await tx.assessmentType.upsert({ where, update: {}, create: data });
          else await tx.feeCategory.upsert({ where, update: {}, create: data });
        }
        for (const [code, nameFr, nameEn] of [
          ["ADMIN", "Administration", "Administration"],
          ["SCIENCES", "Sciences", "Sciences"],
          ["LETTRES", "Langues et lettres", "Languages and literature"],
        ])
          await tx.department.upsert({
            where: { tenantId_code: { tenantId: tenant.id, code: code! } },
            update: {},
            create: { tenantId: tenant.id, code: code!, nameFr: nameFr!, nameEn: nameEn! },
          });
        for (const [code, nameFr, nameEn] of [
          ["FOURNITURES", "Fournitures", "Supplies"],
          ["ENTRETIEN", "Entretien", "Maintenance"],
          ["ENERGIE", "Eau et �lectricit�", "Utilities"],
        ])
          await tx.expenseCategory.upsert({
            where: { tenantId_code: { tenantId: tenant.id, code: code! } },
            update: {},
            create: { tenantId: tenant.id, code: code!, nameFr: nameFr!, nameEn: nameEn! },
          });
        if (
          (await tx.registrationPeriod.count({ where: { tenantId: tenant.id, academicYearId: year.id } })) ===
          0
        ) {
          await tx.registrationPeriod.create({
            data: {
              tenantId: tenant.id,
              academicYearId: year.id,
              name: "Inscription standard (exemple � valider)",
              startDate: year.startDate,
              endDate: year.endDate,
              isOpen: false,
              installments: [0, 1, 2].map((i) => ({
                amountCents: 1000000,
                dueDate: new Date(
                  year.startDate.getTime() + ((year.endDate.getTime() - year.startDate.getTime()) * i) / 3,
                ).toISOString(),
              })),
            },
          });
        }
        console.log(
          JSON.stringify({
            etablissement: tenant.name,
            annee: year.name,
            niveaux: levels.size,
            classes: await tx.classroom.count({
              where: { tenantId: tenant.id, academicYearId: year.id, deletedAt: null },
            }),
            periodes: await tx.academicPeriod.count({
              where: { tenantId: tenant.id, academicYearId: year.id },
            }),
            inscriptions: await tx.registrationPeriod.count({
              where: { tenantId: tenant.id, academicYearId: year.id },
            }),
          }),
        );
      },
      { timeout: 120000 },
    );
  }
}
main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
