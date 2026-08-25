import { z } from "zod";

import { httpUrlSchema } from "../../lib/http-url-schema.js";

export const createCourseSchema = z.object({
  classroomId: z.string().min(1),
  subjectId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
});
export type CreateCourseInput = z.infer<typeof createCourseSchema>;

export const updateCourseSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;

export const listCoursesQuerySchema = z.object({
  classroomId: z.string().min(1).optional(),
  subjectId: z.string().min(1).optional(),
});
export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;

const LEARNING_RESOURCE_TYPES = ["VIDEO", "DOCUMENT", "LINK", "TEXT"] as const;

export const createResourceSchema = z
  .object({
    title: z.string().min(1),
    type: z.enum(LEARNING_RESOURCE_TYPES),
    url: httpUrlSchema.optional(),
    content: z.string().min(1).optional(),
    order: z.coerce.number().int().optional(),
  })
  .refine((data) => data.url !== undefined || data.content !== undefined, {
    message: "Provide at least one of url or content",
  });
export type CreateResourceInput = z.infer<typeof createResourceSchema>;
