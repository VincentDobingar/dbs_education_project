import { apiRequest, type TenantCredentials } from "./apiClient.js";

export type VehicleStatus = "ACTIVE" | "MAINTENANCE" | "RETIRED";

export interface Vehicle {
  id: string;
  plateNumber: string;
  model: string | null;
  capacity: number;
  status: VehicleStatus;
  deletedAt: string | null;
}

export function listVehicles(creds: TenantCredentials): Promise<Vehicle[]> {
  return apiRequest("/transport/vehicles", { ...creds });
}

export function createVehicle(
  input: { plateNumber: string; model?: string; capacity: number },
  creds: TenantCredentials,
): Promise<Vehicle> {
  return apiRequest("/transport/vehicles", { method: "POST", body: input, ...creds });
}

export function retireVehicle(id: string, creds: TenantCredentials): Promise<Vehicle> {
  return apiRequest(`/transport/vehicles/${id}/retire`, { method: "POST", ...creds });
}

export interface TransportRoute {
  id: string;
  name: string;
  vehicleId: string | null;
  driverEmployeeId: string | null;
  deletedAt: string | null;
}

export function listRoutes(creds: TenantCredentials): Promise<TransportRoute[]> {
  return apiRequest("/transport/routes", { ...creds });
}

export function createRoute(
  input: { name: string; vehicleId?: string; driverEmployeeId?: string },
  creds: TenantCredentials,
): Promise<TransportRoute> {
  return apiRequest("/transport/routes", { method: "POST", body: input, ...creds });
}

export function cancelRoute(id: string, creds: TenantCredentials): Promise<void> {
  return apiRequest(`/transport/routes/${id}`, { method: "DELETE", ...creds });
}

export interface RouteStop {
  id: string;
  routeId: string;
  label: string;
  order: number;
  time: string | null;
}

export function listStops(routeId: string, creds: TenantCredentials): Promise<RouteStop[]> {
  return apiRequest(`/transport/routes/${routeId}/stops`, { ...creds });
}

export function addStop(
  routeId: string,
  input: { label: string; order?: number; time?: string },
  creds: TenantCredentials,
): Promise<RouteStop> {
  return apiRequest(`/transport/routes/${routeId}/stops`, { method: "POST", body: input, ...creds });
}

export function removeStop(routeId: string, stopId: string, creds: TenantCredentials): Promise<void> {
  return apiRequest(`/transport/routes/${routeId}/stops/${stopId}`, { method: "DELETE", ...creds });
}

export interface StudentRouteAssignment {
  id: string;
  studentId: string;
  routeId: string;
  stopId: string | null;
}

export function listStudentsForRoute(
  routeId: string,
  creds: TenantCredentials,
): Promise<StudentRouteAssignment[]> {
  return apiRequest(`/transport/routes/${routeId}/students`, { ...creds });
}

export function assignStudent(
  routeId: string,
  input: { studentId: string; stopId?: string },
  creds: TenantCredentials,
): Promise<StudentRouteAssignment> {
  return apiRequest(`/transport/routes/${routeId}/students`, { method: "POST", body: input, ...creds });
}

export function unassignStudent(studentId: string, creds: TenantCredentials): Promise<void> {
  return apiRequest(`/transport/students/${studentId}/assignment`, { method: "DELETE", ...creds });
}

export type TransportAttendanceStatus = "BOARDED" | "ABSENT";

export interface TransportAttendance {
  id: string;
  routeId: string;
  studentId: string;
  date: string;
  status: TransportAttendanceStatus;
}

export function listTransportAttendance(
  routeId: string,
  date: string | undefined,
  creds: TenantCredentials,
): Promise<TransportAttendance[]> {
  const suffix = date ? `?date=${date}` : "";
  return apiRequest(`/transport/routes/${routeId}/attendance${suffix}`, { ...creds });
}

export function recordTransportAttendance(
  routeId: string,
  input: { studentId: string; date: string; status: TransportAttendanceStatus },
  creds: TenantCredentials,
): Promise<TransportAttendance> {
  return apiRequest(`/transport/routes/${routeId}/attendance`, { method: "POST", body: input, ...creds });
}
