import { z } from "zod";

export const createTimetableSchema = z.object({
  classroomId: z.string().min(1),
  academicYearId: z.string().min(1),
  name: z.string().min(1).optional(),
});
export type CreateTimetableInput = z.infer<typeof createTimetableSchema>;

export const listTimetablesQuerySchema = z.object({
  classroomId: z.string().min(1).optional(),
  academicYearId: z.string().min(1).optional(),
});
export type ListTimetablesQuery = z.infer<typeof listTimetablesQuerySchema>;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const createTimetableEntrySchema = z
  .object({
    subjectId: z.string().min(1),
    teacherEmployeeId: z.string().min(1),
    dayOfWeek: z.number().int().min(0).max(6),
    startTime: z.string().regex(TIME_PATTERN, "Expected HH:MM"),
    endTime: z.string().regex(TIME_PATTERN, "Expected HH:MM"),
    roomLabel: z.string().min(1).optional(),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: "startTime must be before endTime",
    path: ["endTime"],
  });
export type CreateTimetableEntryInput = z.infer<typeof createTimetableEntrySchema>;
