import { z } from "zod";

export const CATALOG_KINDS = [
  "EDUCATION_CYCLE",
  "GRADE_LEVEL",
  "SUBJECT",
  "ASSESSMENT_TYPE",
  "FEE_CATEGORY",
] as const;

export const listCatalogQuerySchema = z.object({
  kind: z.enum(CATALOG_KINDS).optional(),
});

export const importCatalogItemsSchema = z.object({
  kind: z.enum(CATALOG_KINDS),
  codes: z.array(z.string().min(1)).min(1).max(100),
});
export type ImportCatalogItemsInput = z.infer<typeof importCatalogItemsSchema>;
