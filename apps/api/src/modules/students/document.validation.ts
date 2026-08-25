import { z } from "zod";

import { httpUrlSchema } from "../../lib/http-url-schema.js";

export const createStudentDocumentSchema = z.object({
  category: z.string().min(1),
  fileUrl: httpUrlSchema,
});
export type CreateStudentDocumentInput = z.infer<typeof createStudentDocumentSchema>;
