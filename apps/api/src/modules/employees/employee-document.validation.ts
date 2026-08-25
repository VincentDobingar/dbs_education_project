import { z } from "zod";

import { httpUrlSchema } from "../../lib/http-url-schema.js";

export const createEmployeeDocumentSchema = z.object({
  category: z.string().min(1),
  fileUrl: httpUrlSchema,
});
export type CreateEmployeeDocumentInput = z.infer<typeof createEmployeeDocumentSchema>;
