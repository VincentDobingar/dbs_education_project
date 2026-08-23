import { z } from "zod";

export const createRoomSchema = z.object({
  name: z.string().min(1),
  capacity: z.coerce.number().int().positive(),
});
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const updateRoomSchema = z.object({
  name: z.string().min(1).optional(),
  capacity: z.coerce.number().int().positive().optional(),
});
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

export const createBedSchema = z.object({
  label: z.string().min(1),
});
export type CreateBedInput = z.infer<typeof createBedSchema>;

export const assignStudentSchema = z
  .object({
    studentId: z.string().min(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });
export type AssignStudentInput = z.infer<typeof assignStudentSchema>;

const DORMITORY_ATTENDANCE_STATUSES = ["PRESENT", "ABSENT"] as const;

export const recordDormitoryAttendanceSchema = z.object({
  date: z.coerce.date(),
  status: z.enum(DORMITORY_ATTENDANCE_STATUSES),
});
export type RecordDormitoryAttendanceInput = z.infer<typeof recordDormitoryAttendanceSchema>;

export const listDormitoryAttendanceQuerySchema = z.object({
  date: z.coerce.date().optional(),
});
export type ListDormitoryAttendanceQuery = z.infer<typeof listDormitoryAttendanceQuerySchema>;
