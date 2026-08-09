import { z } from "zod";

export const importStudentsSchema = z.object({
  csv: z.string().min(1),
});
export type ImportStudentsInput = z.infer<typeof importStudentsSchema>;
