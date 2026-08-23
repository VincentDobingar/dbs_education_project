import { z } from "zod";

const VEHICLE_STATUSES = ["ACTIVE", "MAINTENANCE", "RETIRED"] as const;

export const createVehicleSchema = z.object({
  plateNumber: z.string().min(1),
  model: z.string().min(1).optional(),
  capacity: z.coerce.number().int().positive(),
});
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

export const updateVehicleSchema = z.object({
  model: z.string().min(1).optional(),
  capacity: z.coerce.number().int().positive().optional(),
  status: z.enum(VEHICLE_STATUSES).optional(),
});
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;

export const createRouteSchema = z.object({
  name: z.string().min(1),
  vehicleId: z.string().min(1).optional(),
  driverEmployeeId: z.string().min(1).optional(),
});
export type CreateRouteInput = z.infer<typeof createRouteSchema>;

export const updateRouteSchema = z.object({
  name: z.string().min(1).optional(),
  vehicleId: z.string().min(1).optional(),
  driverEmployeeId: z.string().min(1).optional(),
});
export type UpdateRouteInput = z.infer<typeof updateRouteSchema>;

export const createStopSchema = z.object({
  label: z.string().min(1),
  order: z.coerce.number().int().optional(),
  time: z.string().min(1).optional(),
});
export type CreateStopInput = z.infer<typeof createStopSchema>;

export const assignStudentSchema = z.object({
  studentId: z.string().min(1),
  stopId: z.string().min(1).optional(),
});
export type AssignStudentInput = z.infer<typeof assignStudentSchema>;

const TRANSPORT_ATTENDANCE_STATUSES = ["BOARDED", "ABSENT"] as const;

export const recordTransportAttendanceSchema = z.object({
  studentId: z.string().min(1),
  date: z.coerce.date(),
  status: z.enum(TRANSPORT_ATTENDANCE_STATUSES),
});
export type RecordTransportAttendanceInput = z.infer<typeof recordTransportAttendanceSchema>;

export const listTransportAttendanceQuerySchema = z.object({
  date: z.coerce.date().optional(),
});
export type ListTransportAttendanceQuery = z.infer<typeof listTransportAttendanceQuerySchema>;
