import type { Prisma, Student } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { CreateStudentInput, ListStudentsQuery, UpdateStudentInput } from "./student.validation.js";

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

export interface CurrentEnrollment {
  id: string;
  classroomId: string;
  classroomName: string;
  academicYearId: string;
  academicYearName: string;
}

/**
 * Only an actively enrolled student has a current classroom/year — a PROSPECTIVE
 * student with no Enrollment yet has nothing to derive here (§19). Shared by the ID
 * card, timetable and announcements lookups (all need "this student's current
 * classroom" the same way).
 */
export async function requireCurrentEnrollment(studentId: string): Promise<CurrentEnrollment> {
  const enrollment = await prisma.enrollment.findFirst({
    where: { studentId, deletedAt: null, status: { in: ["ENROLLED", "RE_ENROLLED"] } },
    orderBy: { enrolledAt: "desc" },
    include: { classroom: true, academicYear: true },
  });
  if (!enrollment) {
    throw new AppError(400, "STUDENT_NOT_ENROLLED", "Student has no active enrollment");
  }
  return {
    id: enrollment.id,
    classroomId: enrollment.classroomId,
    classroomName: enrollment.classroom.name,
    academicYearId: enrollment.academicYearId,
    academicYearName: enrollment.academicYear.name,
  };
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
 *
 * classroomId (§22, roll-call): filters to students with a *current* (ENROLLED or
 * RE_ENROLLED) enrollment in that classroom — the roster a teacher/staff member
 * actually needs to take attendance against, not every enrollment that classroom
 * has ever had.
 */
function listStudentsWhere(query: Pick<ListStudentsQuery, "classroomId">): Prisma.StudentWhereInput {
  return {
    deletedAt: null,
    ...(query.classroomId
      ? {
          enrollments: {
            some: {
              classroomId: query.classroomId,
              deletedAt: null,
              status: { in: ["ENROLLED", "RE_ENROLLED"] },
            },
          },
        }
      : {}),
  };
}

export async function listStudents(
  query: Pick<ListStudentsQuery, "classroomId"> = {},
): Promise<Omit<Student, "medicalNotes">[]> {
  return prisma.student.findMany({
    where: listStudentsWhere(query),
    orderBy: { lastName: "asc" },
    omit: { medicalNotes: true },
  });
}

export interface PaginatedStudents {
  data: Omit<Student, "medicalNotes">[];
  total: number;
}

/**
 * Pagination réelle (pas juste un `take`/`skip` sans compte) pour l'unique
 * appelant à risque à l'échelle : la liste complète de l'établissement
 * (`StudentsPage`, sans `classroomId`) peut atteindre plusieurs milliers de
 * lignes pour un gros établissement — les autres appelants (roster de classe
 * pour l'appel, la saisie de notes, la discipline, les devoirs) restent sur
 * `listStudents` ci-dessus, volontairement non paginé (une classe est toujours
 * petite, jamais un risque de volume).
 */
export async function listStudentsPaginated(query: ListStudentsQuery): Promise<PaginatedStudents> {
  const page = query.page ?? 1;
  const where = listStudentsWhere(query);

  // `Promise.all`, jamais `prisma.$transaction([...])` : chaque appel sur ce client
  // (tenant-guard extension, lib/prisma.ts) ouvre déjà sa propre micro-transaction
  // interne pour poser `app.tenant_id` — l'array-batching de `$transaction` attend
  // des `PrismaPromise` différables, pas des promesses déjà résolues par cette
  // extension. Un léger décalage entre `data`/`total` (une ligne insérée entre les
  // deux appels) est un compromis standard et sans conséquence pour une pagination.
  const [data, total] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy: { lastName: "asc" },
      omit: { medicalNotes: true },
      take: query.pageSize,
      skip: (page - 1) * query.pageSize,
    }),
    prisma.student.count({ where }),
  ]);

  return { data, total };
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
