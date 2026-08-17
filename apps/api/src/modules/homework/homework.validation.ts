import { z } from "zod";

export const createHomeworkSchema = z.object({
  classroomId: z.string().min(1),
  subjectId: z.string().min(1),
  title: z.string().min(1),
  instructions: z.string().min(1).optional(),
  dueAt: z.coerce.date(),
});
export type CreateHomeworkInput = z.infer<typeof createHomeworkSchema>;

export const updateHomeworkSchema = z.object({
  title: z.string().min(1).optional(),
  instructions: z.string().min(1).optional(),
  dueAt: z.coerce.date().optional(),
});
export type UpdateHomeworkInput = z.infer<typeof updateHomeworkSchema>;

export const listHomeworkQuerySchema = z.object({
  classroomId: z.string().min(1).optional(),
  subjectId: z.string().min(1).optional(),
});
export type ListHomeworkQuery = z.infer<typeof listHomeworkQuerySchema>;

export const submitHomeworkSchema = z
  .object({
    content: z.string().min(1).optional(),
    fileUrl: z.string().min(1).optional(),
  })
  .refine((data) => data.content !== undefined || data.fileUrl !== undefined, {
    message: "Provide at least one of content or fileUrl",
  });
export type SubmitHomeworkInput = z.infer<typeof submitHomeworkSchema>;
