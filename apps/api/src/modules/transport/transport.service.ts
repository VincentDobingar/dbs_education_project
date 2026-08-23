import type {
  RouteStop,
  StudentRouteAssignment,
  TransportAttendance,
  TransportRoute,
  Vehicle,
} from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";
import { requireStudentRecord } from "../students/student.service.js";

import type {
  AssignStudentInput,
  CreateRouteInput,
  CreateStopInput,
  CreateVehicleInput,
  ListTransportAttendanceQuery,
  RecordTransportAttendanceInput,
  UpdateRouteInput,
  UpdateVehicleInput,
} from "./transport.validation.js";

export async function createVehicle(input: CreateVehicleInput): Promise<Vehicle> {
  const existing = await prisma.vehicle.findFirst({ where: { plateNumber: input.plateNumber } });
  if (existing) {
    throw new AppError(409, "PLATE_NUMBER_TAKEN", `Plate number already in use: ${input.plateNumber}`);
  }

  return prisma.vehicle.create({
    data: {
      tenantId: requireCurrentTenantId(),
      plateNumber: input.plateNumber,
      capacity: input.capacity,
      ...(input.model ? { model: input.model } : {}),
    },
  });
}

export async function listVehicles(): Promise<Vehicle[]> {
  return prisma.vehicle.findMany({ where: { deletedAt: null }, orderBy: { plateNumber: "asc" } });
}

export async function requireVehicle(id: string): Promise<Vehicle> {
  const vehicle = await prisma.vehicle.findUnique({ where: { id } });
  if (!vehicle || vehicle.deletedAt) {
    throw new AppError(404, "VEHICLE_NOT_FOUND", `Vehicle not found: ${id}`);
  }
  return vehicle;
}

export async function updateVehicle(id: string, input: UpdateVehicleInput): Promise<Vehicle> {
  await requireVehicle(id);

  return prisma.vehicle.update({
    where: { id },
    data: {
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    },
  });
}

export async function retireVehicle(id: string): Promise<Vehicle> {
  await requireVehicle(id);
  return prisma.vehicle.update({ where: { id }, data: { deletedAt: new Date(), status: "RETIRED" } });
}

async function assertVehicleExists(vehicleId: string): Promise<void> {
  await requireVehicle(vehicleId);
}

async function assertEmployeeExists(employeeId: string): Promise<void> {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) {
    throw new AppError(404, "EMPLOYEE_NOT_FOUND", `Employee not found: ${employeeId}`);
  }
}

export async function createRoute(input: CreateRouteInput): Promise<TransportRoute> {
  if (input.vehicleId) {
    await assertVehicleExists(input.vehicleId);
  }
  if (input.driverEmployeeId) {
    await assertEmployeeExists(input.driverEmployeeId);
  }

  return prisma.transportRoute.create({
    data: {
      tenantId: requireCurrentTenantId(),
      name: input.name,
      ...(input.vehicleId ? { vehicleId: input.vehicleId } : {}),
      ...(input.driverEmployeeId ? { driverEmployeeId: input.driverEmployeeId } : {}),
    },
  });
}

export async function listRoutes(): Promise<TransportRoute[]> {
  return prisma.transportRoute.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
}

export async function requireRoute(id: string): Promise<TransportRoute> {
  const route = await prisma.transportRoute.findUnique({ where: { id } });
  if (!route || route.deletedAt) {
    throw new AppError(404, "ROUTE_NOT_FOUND", `Transport route not found: ${id}`);
  }
  return route;
}

export async function updateRoute(id: string, input: UpdateRouteInput): Promise<TransportRoute> {
  await requireRoute(id);
  if (input.vehicleId) {
    await assertVehicleExists(input.vehicleId);
  }
  if (input.driverEmployeeId) {
    await assertEmployeeExists(input.driverEmployeeId);
  }

  return prisma.transportRoute.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.vehicleId !== undefined ? { vehicleId: input.vehicleId } : {}),
      ...(input.driverEmployeeId !== undefined ? { driverEmployeeId: input.driverEmployeeId } : {}),
    },
  });
}

export async function cancelRoute(id: string): Promise<void> {
  await requireRoute(id);
  await prisma.transportRoute.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function addStop(routeId: string, input: CreateStopInput): Promise<RouteStop> {
  const route = await requireRoute(routeId);

  return prisma.routeStop.create({
    data: {
      tenantId: route.tenantId,
      routeId,
      label: input.label,
      ...(input.order !== undefined ? { order: input.order } : {}),
      ...(input.time !== undefined ? { time: input.time } : {}),
    },
  });
}

export async function listStopsForRoute(routeId: string): Promise<RouteStop[]> {
  await requireRoute(routeId);
  return prisma.routeStop.findMany({ where: { routeId }, orderBy: { order: "asc" } });
}

async function requireStop(routeId: string, id: string): Promise<RouteStop> {
  const stop = await prisma.routeStop.findUnique({ where: { id } });
  if (!stop || stop.routeId !== routeId) {
    throw new AppError(404, "STOP_NOT_FOUND", `Stop not found: ${id}`);
  }
  return stop;
}

export async function removeStop(routeId: string, id: string): Promise<void> {
  await requireStop(routeId, id);
  await prisma.routeStop.delete({ where: { id } });
}

/**
 * Un seul itinéraire actif par élève (§29) : réaffecter remplace l'affectation
 * existante via `upsert` sur `@@unique([studentId])`, jamais un doublon.
 */
export async function assignStudentToRoute(
  routeId: string,
  input: AssignStudentInput,
): Promise<StudentRouteAssignment> {
  const route = await requireRoute(routeId);
  await requireStudentRecord(input.studentId);
  if (input.stopId) {
    await requireStop(routeId, input.stopId);
  }

  return prisma.studentRouteAssignment.upsert({
    where: { studentId: input.studentId },
    create: {
      tenantId: route.tenantId,
      studentId: input.studentId,
      routeId,
      ...(input.stopId ? { stopId: input.stopId } : {}),
    },
    update: { routeId, stopId: input.stopId ?? null },
  });
}

export async function listStudentsForRoute(routeId: string): Promise<StudentRouteAssignment[]> {
  await requireRoute(routeId);
  return prisma.studentRouteAssignment.findMany({ where: { routeId }, orderBy: { createdAt: "asc" } });
}

export async function unassignStudent(studentId: string): Promise<void> {
  const assignment = await prisma.studentRouteAssignment.findUnique({ where: { studentId } });
  if (!assignment) {
    throw new AppError(404, "ASSIGNMENT_NOT_FOUND", `No route assignment for student: ${studentId}`);
  }
  await prisma.studentRouteAssignment.delete({ where: { studentId } });
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Suivi des trajets (§29) : upsert par jour sur `@@unique([routeId, studentId, date])`
 * — aucune colonne nullable dans cette contrainte, un upsert natif est sûr ici, même
 * raisonnement que `recordStaffAttendance`. */
export async function recordTransportAttendance(
  routeId: string,
  input: RecordTransportAttendanceInput,
): Promise<TransportAttendance> {
  const route = await requireRoute(routeId);
  await requireStudentRecord(input.studentId);
  const date = startOfDay(input.date);

  return prisma.transportAttendance.upsert({
    where: { routeId_studentId_date: { routeId, studentId: input.studentId, date } },
    create: { tenantId: route.tenantId, routeId, studentId: input.studentId, date, status: input.status },
    update: { status: input.status },
  });
}

export async function listTransportAttendanceForRoute(
  routeId: string,
  query: ListTransportAttendanceQuery,
): Promise<TransportAttendance[]> {
  await requireRoute(routeId);
  return prisma.transportAttendance.findMany({
    where: { routeId, ...(query.date ? { date: startOfDay(query.date) } : {}) },
    orderBy: { date: "desc" },
  });
}
