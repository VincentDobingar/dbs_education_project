import type { NextFunction, Request, Response } from "express";

import * as boardingService from "./boarding.service.js";
import {
  assignStudentSchema,
  createBedSchema,
  createRoomSchema,
  listDormitoryAttendanceQuerySchema,
  recordDormitoryAttendanceSchema,
  updateRoomSchema,
} from "./boarding.validation.js";

export function createRoom(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createRoomSchema.parse(req.body);
    const room = await boardingService.createRoom(input);
    res.status(201).json(room);
  })().catch(next);
}

export function listRooms(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const rooms = await boardingService.listRooms();
    res.status(200).json(rooms);
  })().catch(next);
}

export function getRoom(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const room = await boardingService.requireRoom(req.params.id as string);
    res.status(200).json(room);
  })().catch(next);
}

export function updateRoom(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateRoomSchema.parse(req.body);
    const room = await boardingService.updateRoom(req.params.id as string, input);
    res.status(200).json(room);
  })().catch(next);
}

export function archiveRoom(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const room = await boardingService.archiveRoom(req.params.id as string);
    res.status(200).json(room);
  })().catch(next);
}

export function addBed(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createBedSchema.parse(req.body);
    const bed = await boardingService.addBed(req.params.id as string, input);
    res.status(201).json(bed);
  })().catch(next);
}

export function listBeds(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const beds = await boardingService.listBedsForRoom(req.params.id as string);
    res.status(200).json(beds);
  })().catch(next);
}

export function removeBed(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    await boardingService.removeBed(req.params.id as string, req.params.bedId as string);
    res.status(204).send();
  })().catch(next);
}

export function assignStudent(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = assignStudentSchema.parse(req.body);
    const assignment = await boardingService.assignStudentToBed(
      req.params.bedId as string,
      req.params.id as string,
      input,
    );
    res.status(200).json(assignment);
  })().catch(next);
}

export function unassignStudent(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    await boardingService.unassignStudent(req.params.studentId as string);
    res.status(204).send();
  })().catch(next);
}

export function recordAttendance(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = recordDormitoryAttendanceSchema.parse(req.body);
    const attendance = await boardingService.recordDormitoryAttendance(req.params.studentId as string, input);
    res.status(200).json(attendance);
  })().catch(next);
}

export function listAttendance(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listDormitoryAttendanceQuerySchema.parse(req.query);
    const attendance = await boardingService.listDormitoryAttendanceForStudent(
      req.params.studentId as string,
      query,
    );
    res.status(200).json(attendance);
  })().catch(next);
}
