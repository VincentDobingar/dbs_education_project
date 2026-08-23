import { z } from "zod";

export const createMenuSchema = z.object({
  date: z.coerce.date(),
  description: z.string().min(1),
});
export type CreateMenuInput = z.infer<typeof createMenuSchema>;

export const updateMenuSchema = z.object({
  description: z.string().min(1),
});
export type UpdateMenuInput = z.infer<typeof updateMenuSchema>;

export const listMenusQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});
export type ListMenusQuery = z.infer<typeof listMenusQuerySchema>;

const MEAL_PLAN_TYPES = ["DAILY", "WEEKLY", "MONTHLY"] as const;

export const createMealPlanSchema = z.object({
  name: z.string().min(1),
  type: z.enum(MEAL_PLAN_TYPES),
  priceCents: z.coerce.number().int().min(0),
});
export type CreateMealPlanInput = z.infer<typeof createMealPlanSchema>;

export const updateMealPlanSchema = z.object({
  name: z.string().min(1).optional(),
  priceCents: z.coerce.number().int().min(0).optional(),
});
export type UpdateMealPlanInput = z.infer<typeof updateMealPlanSchema>;

export const createEnrollmentSchema = z
  .object({
    studentId: z.string().min(1),
    mealPlanId: z.string().min(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });
export type CreateEnrollmentInput = z.infer<typeof createEnrollmentSchema>;

export const listEnrollmentsQuerySchema = z.object({
  studentId: z.string().min(1).optional(),
  mealPlanId: z.string().min(1).optional(),
});
export type ListEnrollmentsQuery = z.infer<typeof listEnrollmentsQuerySchema>;

const MEAL_ATTENDANCE_STATUSES = ["SERVED", "ABSENT"] as const;

export const recordMealAttendanceSchema = z.object({
  date: z.coerce.date(),
  status: z.enum(MEAL_ATTENDANCE_STATUSES),
});
export type RecordMealAttendanceInput = z.infer<typeof recordMealAttendanceSchema>;

export const listMealAttendanceQuerySchema = z.object({
  date: z.coerce.date().optional(),
});
export type ListMealAttendanceQuery = z.infer<typeof listMealAttendanceQuerySchema>;
