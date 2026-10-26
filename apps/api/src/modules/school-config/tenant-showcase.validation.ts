import { z } from "zod";

export const PUBLIC_DESCRIPTION_MAX_LENGTH = 220;

export const updateTenantShowcaseSchema = z.object({
  // Vide = pas de présentation (la page d'accueil affiche alors type et ville).
  publicDescription: z
    .string()
    .trim()
    .max(PUBLIC_DESCRIPTION_MAX_LENGTH)
    .transform((value) => (value === "" ? null : value)),
  showOnHomepage: z.boolean(),
});
export type UpdateTenantShowcaseInput = z.infer<typeof updateTenantShowcaseSchema>;
