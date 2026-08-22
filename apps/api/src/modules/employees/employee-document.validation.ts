import { z } from "zod";

export const createEmployeeDocumentSchema = z.object({
  category: z.string().min(1),
  fileUrl: z.string().min(1),
});
export type CreateEmployeeDocumentInput = z.infer<typeof createEmployeeDocumentSchema>;
