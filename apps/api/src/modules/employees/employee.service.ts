import type { Employee, TeacherAssignment } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma, rawPrisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { CreateEmployeeInput, UpdateEmployeeInput } from "./employee.validation.js";

async function assertDepartmentExists(departmentId: string): Promise<void> {
  const department = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!department) {
    throw new AppError(404, "DEPARTMENT_NOT_FOUND", `Department not found: ${departmentId}`);
  }
}

/** userId, if given, is a platform-wide User identity (§6) — checked globally, not tenant-scoped. */
async function assertUserExists(userId: string): Promise<void> {
  const user = await rawPrisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", `User not found: ${userId}`);
  }
}

export async function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
  const existing = await prisma.employee.findFirst({ where: { employeeNumber: input.employeeNumber } });
  if (existing) {
    throw new AppError(
      409,
      "EMPLOYEE_NUMBER_TAKEN",
      `Employee number already in use: ${input.employeeNumber}`,
    );
  }

  if (input.departmentId) {
    await assertDepartmentExists(input.departmentId);
  }
  if (input.userId) {
    await assertUserExists(input.userId);
  }

  return prisma.employee.create({
    data: {
      tenantId: requireCurrentTenantId(),
      employeeNumber: input.employeeNumber,
      firstName: input.firstName,
      lastName: input.lastName,
      jobTitle: input.jobTitle,
      ...(input.departmentId ? { departmentId: input.departmentId } : {}),
      ...(input.hireDate ? { hireDate: input.hireDate } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
    },
  });
}

/**
 * General staff listing — deliberately selects only non-sensitive fields. Salary
 * lives on EmploymentContract, a separate model, never joined in here (§27).
 */
export async function listEmployees(): Promise<Employee[]> {
  return prisma.employee.findMany({ where: { deletedAt: null }, orderBy: { lastName: "asc" } });
}

export async function getEmployee(id: string): Promise<Employee> {
  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee || employee.deletedAt) {
    throw new AppError(404, "EMPLOYEE_NOT_FOUND", `Employee not found: ${id}`);
  }
  return employee;
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput): Promise<Employee> {
  await getEmployee(id);

  if (input.departmentId) {
    await assertDepartmentExists(input.departmentId);
  }

  return prisma.employee.update({
    where: { id },
    data: {
      ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
      ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
      ...(input.hireDate !== undefined ? { hireDate: input.hireDate } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });
}

export async function archiveEmployee(id: string): Promise<Employee> {
  await getEmployee(id);
  return prisma.employee.update({ where: { id }, data: { deletedAt: new Date(), status: "TERMINATED" } });
}

export interface EmployeeWorkload {
  assignments: TeacherAssignment[];
  totalHoursPerWeek: number;
}

/**
 * "Charges horaires" (§27) : `TeacherAssignment.hoursPerWeek` (§20, administration
 * académique) porte déjà cette donnée par affectation matière/classe/année — pas de
 * nouveau modèle, juste l'agrégat pour un employé qu'aucun endpoint n'exposait encore.
 * Un employé sans aucune affectation (personnel non enseignant) obtient 0, pas une erreur.
 */
export async function getEmployeeWorkload(
  employeeId: string,
  academicYearId?: string,
): Promise<EmployeeWorkload> {
  await getEmployee(employeeId);

  const assignments = await prisma.teacherAssignment.findMany({
    where: { employeeId, ...(academicYearId ? { academicYearId } : {}) },
    orderBy: { createdAt: "asc" },
  });

  const totalHoursPerWeek = assignments.reduce(
    (sum, assignment) => sum + (assignment.hoursPerWeek?.toNumber() ?? 0),
    0,
  );

  return { assignments, totalHoursPerWeek };
}
