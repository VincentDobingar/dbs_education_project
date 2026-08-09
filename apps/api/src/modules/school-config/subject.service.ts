import type { Department, Subject } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { CreateDepartmentInput, CreateSubjectInput, UpdateSubjectInput } from "./subject.validation.js";

export async function createDepartment(input: CreateDepartmentInput): Promise<Department> {
  const existing = await prisma.department.findFirst({ where: { code: input.code } });
  if (existing) {
    throw new AppError(409, "DEPARTMENT_CODE_TAKEN", `Department code already in use: ${input.code}`);
  }

  return prisma.department.create({
    data: {
      tenantId: requireCurrentTenantId(),
      code: input.code,
      nameFr: input.nameFr,
      nameEn: input.nameEn,
      ...(input.headEmployeeId ? { headEmployeeId: input.headEmployeeId } : {}),
    },
  });
}

export async function listDepartments(): Promise<Department[]> {
  return prisma.department.findMany({ orderBy: { nameFr: "asc" } });
}

async function requireDepartment(id: string): Promise<Department> {
  const department = await prisma.department.findUnique({ where: { id } });
  if (!department) {
    throw new AppError(404, "DEPARTMENT_NOT_FOUND", `Department not found: ${id}`);
  }
  return department;
}

export async function createSubject(input: CreateSubjectInput): Promise<Subject> {
  const existing = await prisma.subject.findFirst({ where: { code: input.code } });
  if (existing) {
    throw new AppError(409, "SUBJECT_CODE_TAKEN", `Subject code already in use: ${input.code}`);
  }

  if (input.departmentId) {
    await requireDepartment(input.departmentId);
  }

  return prisma.subject.create({
    data: {
      tenantId: requireCurrentTenantId(),
      code: input.code,
      nameFr: input.nameFr,
      nameEn: input.nameEn,
      ...(input.departmentId ? { departmentId: input.departmentId } : {}),
    },
  });
}

export async function listSubjects(): Promise<Subject[]> {
  return prisma.subject.findMany({ orderBy: { nameFr: "asc" } });
}

export async function updateSubject(id: string, input: UpdateSubjectInput): Promise<Subject> {
  const subject = await prisma.subject.findUnique({ where: { id } });
  if (!subject) {
    throw new AppError(404, "SUBJECT_NOT_FOUND", `Subject not found: ${id}`);
  }

  if (input.departmentId) {
    await requireDepartment(input.departmentId);
  }

  return prisma.subject.update({
    where: { id },
    data: {
      ...(input.nameFr !== undefined ? { nameFr: input.nameFr } : {}),
      ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
      ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
    },
  });
}
