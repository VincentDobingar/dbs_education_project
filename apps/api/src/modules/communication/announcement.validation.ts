import { z } from "zod";

const ANNOUNCEMENT_AUDIENCES = ["ALL", "STAFF", "TEACHERS", "PARENTS", "STUDENTS", "CLASSROOM"] as const;

export const createAnnouncementSchema = z
  .object({
    title: z.string().min(1),
    body: z.string().min(1),
    audienceScope: z.enum(ANNOUNCEMENT_AUDIENCES).default("ALL"),
    classroomId: z.string().min(1).optional(),
    publishedAt: z.coerce.date().optional(),
    expiresAt: z.coerce.date().optional(),
  })
  .refine((data) => data.audienceScope !== "CLASSROOM" || data.classroomId, {
    message: "classroomId is required when audienceScope is CLASSROOM",
    path: ["classroomId"],
  });
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

export const listAnnouncementsQuerySchema = z.object({
  classroomId: z.string().min(1).optional(),
});
export type ListAnnouncementsQuery = z.infer<typeof listAnnouncementsQuerySchema>;
