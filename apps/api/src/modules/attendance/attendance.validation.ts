import { z } from "zod";

const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;

const attendanceEntrySchema = z.object({
  studentId: z.string().min(1),
  status: z.enum(ATTENDANCE_STATUSES),
  justificationNote: z.string().min(1).optional(),
});

export const recordRollCallSchema = z.object({
  classroomId: z.string().min(1),
  date: z.coerce.date(),
  subjectId: z.string().min(1).optional(),
  entries: z.array(attendanceEntrySchema).min(1),
});
export type RecordRollCallInput = z.infer<typeof recordRollCallSchema>;

export const justifyAbsenceSchema = z.object({
  justificationNote: z.string().min(1),
});
export type JustifyAbsenceInput = z.infer<typeof justifyAbsenceSchema>;

export const listAttendanceQuerySchema = z.object({
  classroomId: z.string().min(1).optional(),
  studentId: z.string().min(1).optional(),
  date: z.coerce.date().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});
export type ListAttendanceQuery = z.infer<typeof listAttendanceQuerySchema>;
