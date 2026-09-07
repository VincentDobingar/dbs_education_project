import { z } from "zod";

const CALENDAR_EVENT_TYPES = ["HOLIDAY", "EXAM_PERIOD", "SCHOOL_EVENT", "OTHER"] as const;

export const createCalendarEventSchema = z
  .object({
    academicYearId: z.string().min(1).optional(),
    type: z.enum(CALENDAR_EVENT_TYPES),
    title: z.string().min(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    description: z.string().min(1).optional(),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });
export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;

export const updateCalendarEventSchema = z
  .object({
    type: z.enum(CALENDAR_EVENT_TYPES).optional(),
    title: z.string().min(1).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    description: z.string().min(1).optional(),
  })
  .refine((data) => !data.endDate || !data.startDate || data.endDate >= data.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });
export type UpdateCalendarEventInput = z.infer<typeof updateCalendarEventSchema>;

export const listCalendarEventsQuerySchema = z.object({
  academicYearId: z.string().min(1).optional(),
  type: z.enum(CALENDAR_EVENT_TYPES).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});
export type ListCalendarEventsQuery = z.infer<typeof listCalendarEventsQuerySchema>;
