import { z } from "zod";

const EMPLOYEE_ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE"] as const;

export const recordStaffAttendanceSchema = z.object({
  date: z.coerce.date(),
  status: z.enum(EMPLOYEE_ATTENDANCE_STATUSES),
  checkInAt: z.coerce.date().optional(),
  checkOutAt: z.coerce.date().optional(),
});
export type RecordStaffAttendanceInput = z.infer<typeof recordStaffAttendanceSchema>;

export const listStaffAttendanceQuerySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});
export type ListStaffAttendanceQuery = z.infer<typeof listStaffAttendanceQuerySchema>;
