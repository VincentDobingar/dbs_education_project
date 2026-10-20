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
export async function listCatalogItems(kind?: CatalogKind): Promise<CatalogItem[]> {
  return prisma.catalogItem.findMany({
    where: { isActive: true, ...(kind ? { kind } : {}) },
    orderBy: [{ kind: "asc" }, { order: "asc" }, { nameFr: "asc" }],
  });
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
    }
  }

  return { created, skipped };
}
