import type { Student } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { CreateStudentInput, UpdateStudentInput } from "./student.validation.js";

async function assertMatriculeAvailable(matricule: string): Promise<void> {
  const existing = await prisma.student.findFirst({ where: { matricule } });
  if (existing) {
    throw new AppError(409, "MATRICULE_TAKEN", `Matricule already in use: ${matricule}`);
  }
}

export interface PossibleDuplicateStudent {
  id: string;
  matricule: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date | null;
  status: Student["status"];
}

/**
 * Doublon detection (§19): same last name plus either a matching first name or a
 * matching date of birth, within the same tenant. Deliberately a same-name/DOB
 * heuristic rather than an exact-match rule — it is meant to surface candidates for
 * a human to review, never to block a creation outright.
 */
export async function checkDuplicateStudents(
  firstName: string,
  lastName: string,
  dateOfBirth?: Date,
): Promise<PossibleDuplicateStudent[]> {
  return prisma.student.findMany({
    where: {
      deletedAt: null,
      lastName: { equals: lastName, mode: "insensitive" },
      OR: [
        { firstName: { equals: firstName, mode: "insensitive" } },
        ...(dateOfBirth ? [{ dateOfBirth }] : []),
      ],
    },
    select: { id: true, matricule: true, firstName: true, lastName: true, dateOfBirth: true, status: true },
  });
}

/**
 * Full record, medicalNotes included — for internal server-side use only (e.g. the
 * enrollment service checking a student's current status). Never return this
 * directly from a controller; use getStudent/listStudents below instead.
 */
export async function requireStudentRecord(id: string): Promise<Student> {
  const student = await prisma.student.findUnique({ where: { id } });
  if (!student || student.deletedAt) {
    throw new AppError(404, "STUDENT_NOT_FOUND", `Student not found: ${id}`);
  }
  return student;
}

export async function createStudent(
  input: CreateStudentInput,
): Promise<Omit<Student, "medicalNotes"> & { possibleDuplicates: PossibleDuplicateStudent[] }> {
  await assertMatriculeAvailable(input.matricule);

  const possibleDuplicates = await checkDuplicateStudents(input.firstName, input.lastName, input.dateOfBirth);

  const student = await prisma.student.create({
    data: {
      tenantId: requireCurrentTenantId(),
      matricule: input.matricule,
      firstName: input.firstName,
      lastName: input.lastName,
      ...(input.dateOfBirth ? { dateOfBirth: input.dateOfBirth } : {}),
      ...(input.gender ? { gender: input.gender } : {}),
      ...(input.photoUrl ? { photoUrl: input.photoUrl } : {}),
      ...(input.emergencyContactName ? { emergencyContactName: input.emergencyContactName } : {}),
      ...(input.emergencyContactPhone ? { emergencyContactPhone: input.emergencyContactPhone } : {}),
      ...(input.medicalNotes ? { medicalNotes: input.medicalNotes } : {}),
    },
    omit: { medicalNotes: true },
  });

  return { ...student, possibleDuplicates };
}

/**
 * medicalNotes is deliberately never returned here (§19): the platform has no
 * infirmary/direction-only endpoint yet to read it back, so it stays write-only
 * through the general student API until that dedicated access path exists.
 */
export async function listStudents(): Promise<Omit<Student, "medicalNotes">[]> {
  return prisma.student.findMany({
    where: { deletedAt: null },
    orderBy: { lastName: "asc" },
    omit: { medicalNotes: true },
  });
}

export async function getStudent(id: string): Promise<Omit<Student, "medicalNotes">> {
  const student = await prisma.student.findUnique({ where: { id }, omit: { medicalNotes: true } });
  if (!student || student.deletedAt) {
    throw new AppError(404, "STUDENT_NOT_FOUND", `Student not found: ${id}`);
  }
  return student;
}

export async function updateStudent(
  id: string,
  input: UpdateStudentInput,
): Promise<Omit<Student, "medicalNotes">> {
  await requireStudentRecord(id);

  return prisma.student.update({
    where: { id },
    data: {
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      ...(input.dateOfBirth !== undefined ? { dateOfBirth: input.dateOfBirth } : {}),
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
      ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl } : {}),
      ...(input.emergencyContactName !== undefined
        ? { emergencyContactName: input.emergencyContactName }
        : {}),
      ...(input.emergencyContactPhone !== undefined
        ? { emergencyContactPhone: input.emergencyContactPhone }
        : {}),
      ...(input.medicalNotes !== undefined ? { medicalNotes: input.medicalNotes } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
    omit: { medicalNotes: true },
  });
}

export async function archiveStudent(id: string): Promise<Omit<Student, "medicalNotes">> {
  await requireStudentRecord(id);
  return prisma.student.update({
    where: { id },
    data: { deletedAt: new Date(), status: "ARCHIVED" },
    omit: { medicalNotes: true },
  });
}
