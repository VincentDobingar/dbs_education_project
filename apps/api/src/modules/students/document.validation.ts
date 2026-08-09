import { z } from "zod";

export const createStudentDocumentSchema = z.object({
  category: z.string().min(1),
  fileUrl: z.string().min(1),
});
export type CreateStudentDocumentInput = z.infer<typeof createStudentDocumentSchema>;
