import { z } from "zod";

import { httpUrlSchema } from "../../lib/http-url-schema.js";

export const createContractSchema = z.object({
  contractType: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  salaryCents: z.coerce.number().int().min(0).optional(),
  fileUrl: httpUrlSchema.optional(),
});
export type CreateContractInput = z.infer<typeof createContractSchema>;

export const updateContractSchema = z.object({
  endDate: z.coerce.date().optional(),
  salaryCents: z.coerce.number().int().min(0).optional(),
  fileUrl: httpUrlSchema.optional(),
});
export type UpdateContractInput = z.infer<typeof updateContractSchema>;
