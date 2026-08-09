import type { NextFunction, Request, Response } from "express";

import * as academicStructureService from "./academic-structure.service.js";
import {
  createClassroomSchema,
  createEducationCycleSchema,
  createGradeLevelSchema,
  updateClassroomSchema,
} from "./academic-structure.validation.js";

export function createEducationCycle(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createEducationCycleSchema.parse(req.body);
    const cycle = await academicStructureService.createEducationCycle(input);
    res.status(201).json(cycle);
  })().catch(next);
}

export function listEducationCycles(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const cycles = await academicStructureService.listEducationCycles();
    res.status(200).json(cycles);
  })().catch(next);
}

export function createGradeLevel(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createGradeLevelSchema.parse(req.body);
    const gradeLevel = await academicStructureService.createGradeLevel(req.params.cycleId as string, input);
    res.status(201).json(gradeLevel);
  })().catch(next);
}

export function listGradeLevels(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const cycleId = typeof req.query.cycleId === "string" ? req.query.cycleId : undefined;
    const gradeLevels = await academicStructureService.listGradeLevels(cycleId);
    res.status(200).json(gradeLevels);
  })().catch(next);
}

export function createClassroom(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createClassroomSchema.parse(req.body);
    const classroom = await academicStructureService.createClassroom(input);
    res.status(201).json(classroom);
  })().catch(next);
}

export function listClassrooms(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const academicYearId =
      typeof req.query.academicYearId === "string" ? req.query.academicYearId : undefined;
    const classrooms = await academicStructureService.listClassrooms(academicYearId);
    res.status(200).json(classrooms);
  })().catch(next);
}

export function updateClassroom(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateClassroomSchema.parse(req.body);
    const classroom = await academicStructureService.updateClassroom(req.params.id as string, input);
    res.status(200).json(classroom);
  })().catch(next);
}
