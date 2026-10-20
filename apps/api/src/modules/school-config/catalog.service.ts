import type { CatalogItem, CatalogKind, EducationCycle } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { ImportCatalogItemsInput } from "./catalog.validation.js";

/**
 * §17 : catalogue de référence global (CatalogItem, sans tenantId — le client gardé
 * `prisma` ne le filtre pas). L'import COPIE les éléments choisis dans les tables
 * de l'établissement courant ; un code déjà présent chez lui est ignoré (jamais
 * écrasé), ce qui rend l'import rejouable sans risque.
 */
/** Pays de l'établissement courant — filtre les jours fériés et oriente les suggestions. */
export async function getTenantCountryIsoCode(): Promise<string | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: requireCurrentTenantId() },
    select: { country: { select: { isoCode: true } } },
  });
  return tenant?.country.isoCode ?? null;
}

export async function listCatalogItems(kind?: CatalogKind): Promise<CatalogItem[]> {
  // Jours fériés : uniquement ceux du pays de l'établissement.
  const countryIsoCode = kind === "HOLIDAY" ? await getTenantCountryIsoCode() : undefined;
  return prisma.catalogItem.findMany({
    where: {
      isActive: true,
      ...(kind ? { kind } : {}),
      ...(kind === "HOLIDAY" ? { countryIsoCode: countryIsoCode ?? "__NONE__" } : {}),
      // Sans filtre de type, jamais les fériés d'autres pays.
      ...(kind ? {} : { NOT: { kind: "HOLIDAY" } }),
    },
    orderBy: [{ kind: "asc" }, { order: "asc" }, { nameFr: "asc" }],
  });
}

/**
 * Première occurrence de (mois, jour) comprise dans [start, end] — une année
 * scolaire chevauche deux années civiles. `null` si la date tombe hors de l'année
 * scolaire (ex. 15 août pour une année d'octobre à juin).
 */
export function holidayDateWithin(month: number, day: number, start: Date, end: Date): Date | null {
  for (let year = start.getUTCFullYear(); year <= end.getUTCFullYear(); year++) {
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCMonth() !== month - 1) continue; // ex. 29 février hors année bissextile
    if (candidate >= start && candidate <= end) return candidate;
  }
  return null;
}

export interface ImportCatalogResult {
  created: string[];
  skipped: string[];
}

async function requireCatalogItems(kind: CatalogKind, codes: string[]): Promise<CatalogItem[]> {
  const items = await prisma.catalogItem.findMany({ where: { kind, code: { in: codes }, isActive: true } });
  const missing = codes.filter((code) => !items.some((item) => item.code === code));
  if (missing.length > 0) {
    throw new AppError(404, "CATALOG_ITEM_NOT_FOUND", `Unknown catalog codes: ${missing.join(", ")}`);
  }
  return items.sort((a, b) => a.order - b.order);
}

/** Cycle de l'établissement portant ce code, importé depuis le catalogue s'il manque. */
async function ensureTenantCycle(cycleCode: string, created: string[]): Promise<EducationCycle> {
  const existing = await prisma.educationCycle.findFirst({ where: { code: cycleCode } });
  if (existing) return existing;

  const catalogCycle = await prisma.catalogItem.findUnique({
    where: { kind_code: { kind: "EDUCATION_CYCLE", code: cycleCode } },
  });
  if (!catalogCycle) {
    throw new AppError(404, "CATALOG_ITEM_NOT_FOUND", `Unknown catalog cycle: ${cycleCode}`);
  }
  const cycle = await prisma.educationCycle.create({
    data: {
      tenantId: requireCurrentTenantId(),
      code: catalogCycle.code,
      nameFr: catalogCycle.nameFr,
      nameEn: catalogCycle.nameEn,
      order: catalogCycle.order,
    },
  });
  created.push(`EDUCATION_CYCLE:${cycle.code}`);
  return cycle;
}

export async function importCatalogItems(input: ImportCatalogItemsInput): Promise<ImportCatalogResult> {
  const codes = [...new Set(input.codes)];
  const items = await requireCatalogItems(input.kind, codes);
  const tenantId = requireCurrentTenantId();
  const created: string[] = [];
  const skipped: string[] = [];

  if (input.kind === "ROOM" && input.campusId) {
    const campus = await prisma.campus.findUnique({ where: { id: input.campusId } });
    if (!campus || campus.deletedAt) {
      throw new AppError(404, "CAMPUS_NOT_FOUND", `Campus not found: ${input.campusId}`);
    }
  }
  const academicYear =
    input.kind === "HOLIDAY"
      ? await prisma.academicYear.findUnique({ where: { id: input.academicYearId ?? "" } })
      : null;
  if (input.kind === "HOLIDAY" && (!academicYear || academicYear.deletedAt)) {
    throw new AppError(422, "ACADEMIC_YEAR_REQUIRED", "Choose the academic year to place holidays in");
  }
  const tenantCountry = input.kind === "HOLIDAY" ? await getTenantCountryIsoCode() : null;

  for (const item of items) {
    const base = { tenantId, code: item.code, nameFr: item.nameFr, nameEn: item.nameEn };

    switch (input.kind) {
      case "EDUCATION_CYCLE": {
        if (await prisma.educationCycle.findFirst({ where: { code: item.code } })) {
          skipped.push(item.code);
          break;
        }
        await prisma.educationCycle.create({ data: { ...base, order: item.order } });
        created.push(item.code);
        break;
      }
      case "GRADE_LEVEL": {
        if (await prisma.gradeLevel.findFirst({ where: { code: item.code } })) {
          skipped.push(item.code);
          break;
        }
        if (!item.parentCode) {
          throw new AppError(422, "CATALOG_ITEM_INVALID", `Grade level without cycle: ${item.code}`);
        }
        const cycle = await ensureTenantCycle(item.parentCode, created);
        await prisma.gradeLevel.create({ data: { ...base, cycleId: cycle.id, order: item.order } });
        created.push(item.code);
        break;
      }
      case "SUBJECT": {
        if (await prisma.subject.findFirst({ where: { code: item.code } })) {
          skipped.push(item.code);
          break;
        }
        await prisma.subject.create({ data: base });
        created.push(item.code);
        break;
      }
      case "ASSESSMENT_TYPE": {
        if (await prisma.assessmentType.findFirst({ where: { code: item.code } })) {
          skipped.push(item.code);
          break;
        }
        await prisma.assessmentType.create({ data: base });
        created.push(item.code);
        break;
      }
      case "FEE_CATEGORY": {
        if (await prisma.feeCategory.findFirst({ where: { code: item.code } })) {
          skipped.push(item.code);
          break;
        }
        await prisma.feeCategory.create({ data: base });
        created.push(item.code);
        break;
      }
      case "CAMPUS": {
        if (await prisma.campus.findFirst({ where: { code: item.code } })) {
          skipped.push(item.code);
          break;
        }
        // Le premier campus de l'établissement devient le campus principal.
        const hasMain = await prisma.campus.findFirst({ where: { isMain: true, deletedAt: null } });
        await prisma.campus.create({
          data: { tenantId, code: item.code, name: item.nameFr, isMain: !hasMain },
        });
        created.push(item.code);
        break;
      }
      case "ROOM": {
        // Unicité (tenantId, name) en base, salles archivées comprises.
        if (await prisma.room.findFirst({ where: { name: item.nameFr } })) {
          skipped.push(item.code);
          break;
        }
        await prisma.room.create({
          data: {
            tenantId,
            name: item.nameFr,
            ...(input.campusId ? { campusId: input.campusId } : {}),
            ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
          },
        });
        created.push(item.code);
        break;
      }
      case "HOLIDAY": {
        if (!academicYear || item.countryIsoCode !== tenantCountry || !item.month || !item.day) {
          skipped.push(item.code);
          break;
        }
        const date = holidayDateWithin(item.month, item.day, academicYear.startDate, academicYear.endDate);
        if (!date) {
          skipped.push(item.code);
          break;
        }
        const duplicate = await prisma.calendarEvent.findFirst({
          where: { title: item.nameFr, startDate: date, deletedAt: null },
        });
        if (duplicate) {
          skipped.push(item.code);
          break;
        }
        await prisma.calendarEvent.create({
          data: {
            tenantId,
            academicYearId: academicYear.id,
            type: "HOLIDAY",
            title: item.nameFr,
            startDate: date,
          },
        });
        created.push(item.code);
        break;
      }
    }
  }

  return { created, skipped };
}
