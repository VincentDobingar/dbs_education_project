import type { Room } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { CreateRoomInput, ListRoomsQuery, UpdateRoomInput } from "./room.validation.js";

export async function createRoom(input: CreateRoomInput): Promise<Room> {
  const existing = await prisma.room.findFirst({ where: { name: input.name } });
  if (existing) {
    throw new AppError(409, "ROOM_NAME_TAKEN", `Room name already in use: ${input.name}`);
  }
  if (input.campusId) {
    const campus = await prisma.campus.findUnique({ where: { id: input.campusId } });
    if (!campus || campus.deletedAt) {
      throw new AppError(404, "CAMPUS_NOT_FOUND", `Campus not found: ${input.campusId}`);
    }
  }

  return prisma.room.create({
    data: {
      tenantId: requireCurrentTenantId(),
      name: input.name,
      ...(input.campusId ? { campusId: input.campusId } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
    },
  });
}

export async function listRooms(query: ListRoomsQuery): Promise<Room[]> {
  return prisma.room.findMany({
    where: { deletedAt: null, ...(query.campusId ? { campusId: query.campusId } : {}) },
    orderBy: { name: "asc" },
  });
}

export async function requireRoom(id: string): Promise<Room> {
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room || room.deletedAt) {
    throw new AppError(404, "ROOM_NOT_FOUND", `Room not found: ${id}`);
  }
  return room;
}

export async function updateRoom(id: string, input: UpdateRoomInput): Promise<Room> {
  const room = await requireRoom(id);

  if (input.name && input.name !== room.name) {
    const existing = await prisma.room.findFirst({ where: { name: input.name } });
    if (existing) {
      throw new AppError(409, "ROOM_NAME_TAKEN", `Room name already in use: ${input.name}`);
    }
  }
  if (input.campusId) {
    const campus = await prisma.campus.findUnique({ where: { id: input.campusId } });
    if (!campus || campus.deletedAt) {
      throw new AppError(404, "CAMPUS_NOT_FOUND", `Campus not found: ${input.campusId}`);
    }
  }

  return prisma.room.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.campusId !== undefined ? { campusId: input.campusId } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
    },
  });
}

export async function archiveRoom(id: string): Promise<Room> {
  await requireRoom(id);
  return prisma.room.update({ where: { id }, data: { deletedAt: new Date() } });
}
