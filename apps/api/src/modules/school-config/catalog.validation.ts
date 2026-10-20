import { z } from "zod";

export const CATALOG_KINDS = [
  "EDUCATION_CYCLE",
  "GRADE_LEVEL",
  "SUBJECT",
  "ASSESSMENT_TYPE",
  "FEE_CATEGORY",
  "CAMPUS",
  "ROOM",
  "HOLIDAY",
] as const;

export const listCatalogQuerySchema = z.object({
  kind: z.enum(CATALOG_KINDS).optional(),
});

export const importCatalogItemsSchema = z.object({
  kind: z.enum(CATALOG_KINDS),
  codes: z.array(z.string().min(1)).min(1).max(100),
  /** ROOM : campus de rattachement et capacité appliqués à toutes les salles importées. */
  campusId: z.string().min(1).optional(),
  capacity: z.number().int().positive().optional(),
  /** HOLIDAY (obligatoire) : année scolaire dans laquelle placer les jours fériés. */
  academicYearId: z.string().min(1).optional(),
});
export type ImportCatalogItemsInput = z.infer<typeof importCatalogItemsSchema>;
