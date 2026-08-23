import type { DormitoryAttendance, DormitoryBed, DormitoryRoom, StudentBedAssignment } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";
import { requireStudentRecord } from "../students/student.service.js";

import type {
  AssignStudentInput,
  CreateBedInput,
  CreateRoomInput,
  ListDormitoryAttendanceQuery,
  RecordDormitoryAttendanceInput,
  UpdateRoomInput,
} from "./boarding.validation.js";

export async function createRoom(input: CreateRoomInput): Promise<DormitoryRoom> {
  const existing = await prisma.dormitoryRoom.findFirst({ where: { name: input.name } });
  if (existing) {
    throw new AppError(409, "ROOM_NAME_TAKEN", `Room name already in use: ${input.name}`);
  }

  return prisma.dormitoryRoom.create({
    data: { tenantId: requireCurrentTenantId(), name: input.name, capacity: input.capacity },
  });
}

export async function listRooms(): Promise<DormitoryRoom[]> {
  return prisma.dormitoryRoom.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
}

export async function requireRoom(id: string): Promise<DormitoryRoom> {
  const room = await prisma.dormitoryRoom.findUnique({ where: { id } });
  if (!room || room.deletedAt) {
    throw new AppError(404, "ROOM_NOT_FOUND", `Room not found: ${id}`);
  }
  return room;
}

export async function updateRoom(id: string, input: UpdateRoomInput): Promise<DormitoryRoom> {
  await requireRoom(id);

  return prisma.dormitoryRoom.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
    },
  });
}

export async function archiveRoom(id: string): Promise<DormitoryRoom> {
  await requireRoom(id);
  return prisma.dormitoryRoom.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function addBed(
  roomId: string,
  input: CreateBedInput,
): Promise<DormitoryBed & { assignment: StudentBedAssignment | null }> {
  const room = await requireRoom(roomId);

  return prisma.dormitoryBed.create({
    data: { tenantId: room.tenantId, roomId, label: input.label },
    include: { assignment: true },
  });
}

/** Inclut l'affectation courante de chaque lit — l'occupation se lit d'un coup
 * d'œil, pas besoin d'un second appel par lit. */
export async function listBedsForRoom(
  roomId: string,
): Promise<(DormitoryBed & { assignment: StudentBedAssignment | null })[]> {
  await requireRoom(roomId);
  return prisma.dormitoryBed.findMany({
    where: { roomId },
    include: { assignment: true },
    orderBy: { label: "asc" },
  });
}

async function requireBed(roomId: string, id: string): Promise<DormitoryBed> {
  const bed = await prisma.dormitoryBed.findUnique({ where: { id } });
  if (!bed || bed.roomId !== roomId) {
    throw new AppError(404, "BED_NOT_FOUND", `Bed not found: ${id}`);
  }
  return bed;
}

/** FK `RESTRICT` (pas `CASCADE`) sur `StudentBedAssignment.bedId` (§29) : un lit
 * occupé ne peut pas être supprimé en silence — vérifié ici pour renvoyer un 409
 * propre plutôt que de laisser remonter la contrainte Postgres brute. */
export async function removeBed(roomId: string, id: string): Promise<void> {
  await requireBed(roomId, id);
  const assignment = await prisma.studentBedAssignment.findUnique({ where: { bedId: id } });
  if (assignment) {
    throw new AppError(409, "BED_OCCUPIED", "Cannot remove a bed that currently has a student assigned");
  }
  await prisma.dormitoryBed.delete({ where: { id } });
}

/**
 * Un seul occupant par lit (contrainte `bedId` unique, §29) : refusé si un autre
 * élève y est déjà. Réaffecter le même élève vers un nouveau lit (`upsert` par
 * `studentId`) libère automatiquement son ancien lit, jamais une double occupation.
 */
export async function assignStudentToBed(
  bedId: string,
  roomId: string,
  input: AssignStudentInput,
): Promise<StudentBedAssignment> {
  const bed = await requireBed(roomId, bedId);
  await requireStudentRecord(input.studentId);

  const existingOccupant = await prisma.studentBedAssignment.findUnique({ where: { bedId } });
  if (existingOccupant && existingOccupant.studentId !== input.studentId) {
    throw new AppError(409, "BED_OCCUPIED", "This bed is already assigned to another student");
  }

  return prisma.studentBedAssignment.upsert({
    where: { studentId: input.studentId },
    create: {
      tenantId: bed.tenantId,
      studentId: input.studentId,
      bedId,
      startDate: input.startDate,
      ...(input.endDate ? { endDate: input.endDate } : {}),
    },
    update: { bedId, startDate: input.startDate, endDate: input.endDate ?? null },
  });
}

export async function requireAssignmentForStudent(studentId: string): Promise<StudentBedAssignment> {
  const assignment = await prisma.studentBedAssignment.findUnique({ where: { studentId } });
  if (!assignment) {
    throw new AppError(404, "ASSIGNMENT_NOT_FOUND", `No bed assignment for student: ${studentId}`);
  }
  return assignment;
}

export async function unassignStudent(studentId: string): Promise<void> {
  await requireAssignmentForStudent(studentId);
  await prisma.studentBedAssignment.delete({ where: { studentId } });
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Suivi des présences nocturnes (§29) : upsert par nuit sur
 * `@@unique([assignmentId, date])` — aucune colonne nullable dans cette contrainte,
 * même raisonnement que `recordTransportAttendance`/`recordMealAttendance`. */
export async function recordDormitoryAttendance(
  studentId: string,
  input: RecordDormitoryAttendanceInput,
): Promise<DormitoryAttendance> {
  const assignment = await requireAssignmentForStudent(studentId);
  const date = startOfDay(input.date);

  return prisma.dormitoryAttendance.upsert({
    where: { assignmentId_date: { assignmentId: assignment.id, date } },
    create: { tenantId: assignment.tenantId, assignmentId: assignment.id, date, status: input.status },
    update: { status: input.status },
  });
}

export async function listDormitoryAttendanceForStudent(
  studentId: string,
  query: ListDormitoryAttendanceQuery,
): Promise<DormitoryAttendance[]> {
  const assignment = await requireAssignmentForStudent(studentId);
  return prisma.dormitoryAttendance.findMany({
    where: { assignmentId: assignment.id, ...(query.date ? { date: startOfDay(query.date) } : {}) },
    orderBy: { date: "desc" },
  });
}
