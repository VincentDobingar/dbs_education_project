import type { EmployeeAttendance } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import { getEmployee } from "./employee.service.js";
import type { ListStaffAttendanceQuery, RecordStaffAttendanceInput } from "./staff-attendance.validation.js";

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Upsert par jour (§27, présences/retards du personnel) : contrairement à
 * `Attendance` (élèves), `@@unique([employeeId, date])` n'a pas de colonne nullable
 * dans sa contrainte — un upsert natif Prisma est donc sûr ici, jamais le piège NULL
 * documenté sur `recordRollCall`.
 */
export async function recordStaffAttendance(
  employeeId: string,
  input: RecordStaffAttendanceInput,
): Promise<EmployeeAttendance> {
  await getEmployee(employeeId);
  const tenantId = requireCurrentTenantId();
  const date = startOfDay(input.date);

  return prisma.employeeAttendance.upsert({
    where: { employeeId_date: { employeeId, date } },
    create: {
      tenantId,
      employeeId,
      date,
      status: input.status,
      ...(input.checkInAt ? { checkInAt: input.checkInAt } : {}),
      ...(input.checkOutAt ? { checkOutAt: input.checkOutAt } : {}),
    },
    update: {
      status: input.status,
      ...(input.checkInAt !== undefined ? { checkInAt: input.checkInAt } : {}),
      ...(input.checkOutAt !== undefined ? { checkOutAt: input.checkOutAt } : {}),
    },
  });
}

export async function listStaffAttendance(
  employeeId: string,
  query: ListStaffAttendanceQuery,
): Promise<EmployeeAttendance[]> {
  await getEmployee(employeeId);
  return prisma.employeeAttendance.findMany({
    where: {
      employeeId,
      ...(query.startDate || query.endDate
        ? {
            date: {
              ...(query.startDate ? { gte: startOfDay(query.startDate) } : {}),
              ...(query.endDate ? { lte: startOfDay(query.endDate) } : {}),
            },
          }
        : {}),
    },
    orderBy: { date: "desc" },
  });
}
