import { z } from "zod";

export const createEmployeeSchema = z.object({
  employeeNumber: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  jobTitle: z.string().min(1),
  departmentId: z.string().min(1).optional(),
  hireDate: z.coerce.date().optional(),
  userId: z.string().min(1).optional(),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

const EMPLOYEE_STATUSES = ["ACTIVE", "ON_LEAVE", "TERMINATED"] as const;

export const updateEmployeeSchema = z.object({
  jobTitle: z.string().min(1).optional(),
  departmentId: z.string().min(1).optional(),
  hireDate: z.coerce.date().optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
});
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
