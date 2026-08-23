import type { NextFunction, Request, Response } from "express";

import * as transportService from "./transport.service.js";
import {
  assignStudentSchema,
  createRouteSchema,
  createStopSchema,
  createVehicleSchema,
  listTransportAttendanceQuerySchema,
  recordTransportAttendanceSchema,
  updateRouteSchema,
  updateVehicleSchema,
} from "./transport.validation.js";

export function createVehicle(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createVehicleSchema.parse(req.body);
    const vehicle = await transportService.createVehicle(input);
    res.status(201).json(vehicle);
  })().catch(next);
}

export function listVehicles(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const vehicles = await transportService.listVehicles();
    res.status(200).json(vehicles);
  })().catch(next);
}

export function getVehicle(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const vehicle = await transportService.requireVehicle(req.params.id as string);
    res.status(200).json(vehicle);
  })().catch(next);
}

export function updateVehicle(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateVehicleSchema.parse(req.body);
    const vehicle = await transportService.updateVehicle(req.params.id as string, input);
    res.status(200).json(vehicle);
  })().catch(next);
}

export function retireVehicle(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const vehicle = await transportService.retireVehicle(req.params.id as string);
    res.status(200).json(vehicle);
  })().catch(next);
}

export function createRoute(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createRouteSchema.parse(req.body);
    const route = await transportService.createRoute(input);
    res.status(201).json(route);
  })().catch(next);
}

export function listRoutes(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const routes = await transportService.listRoutes();
    res.status(200).json(routes);
  })().catch(next);
}

export function getRoute(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const route = await transportService.requireRoute(req.params.id as string);
    res.status(200).json(route);
  })().catch(next);
}

export function updateRoute(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateRouteSchema.parse(req.body);
    const route = await transportService.updateRoute(req.params.id as string, input);
    res.status(200).json(route);
  })().catch(next);
}

export function cancelRoute(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    await transportService.cancelRoute(req.params.id as string);
    res.status(204).send();
  })().catch(next);
}

export function addStop(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createStopSchema.parse(req.body);
    const stop = await transportService.addStop(req.params.id as string, input);
    res.status(201).json(stop);
  })().catch(next);
}

export function listStops(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const stops = await transportService.listStopsForRoute(req.params.id as string);
    res.status(200).json(stops);
  })().catch(next);
}

export function removeStop(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    await transportService.removeStop(req.params.id as string, req.params.stopId as string);
    res.status(204).send();
  })().catch(next);
}

export function assignStudent(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = assignStudentSchema.parse(req.body);
    const assignment = await transportService.assignStudentToRoute(req.params.id as string, input);
    res.status(200).json(assignment);
  })().catch(next);
}

export function listStudentsForRoute(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const assignments = await transportService.listStudentsForRoute(req.params.id as string);
    res.status(200).json(assignments);
  })().catch(next);
}

export function unassignStudent(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    await transportService.unassignStudent(req.params.studentId as string);
    res.status(204).send();
  })().catch(next);
}

export function recordAttendance(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = recordTransportAttendanceSchema.parse(req.body);
    const attendance = await transportService.recordTransportAttendance(req.params.id as string, input);
    res.status(200).json(attendance);
  })().catch(next);
}

export function listAttendance(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listTransportAttendanceQuerySchema.parse(req.query);
    const attendance = await transportService.listTransportAttendanceForRoute(req.params.id as string, query);
    res.status(200).json(attendance);
  })().catch(next);
}
