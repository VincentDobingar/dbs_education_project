import type { NextFunction, Request, Response } from "express";

import * as teacherAssignmentService from "./teacher-assignment.service.js";
import {
  createTeacherAssignmentSchema,
  listTeacherAssignmentsQuerySchema,
} from "./teacher-assignment.validation.js";

export function createTeacherAssignment(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createTeacherAssignmentSchema.parse(req.body);
    const assignment = await teacherAssignmentService.createTeacherAssignment(input);
    res.status(201).json(assignment);
  })().catch(next);
}

export function listTeacherAssignments(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listTeacherAssignmentsQuerySchema.parse(req.query);
    const assignments = await teacherAssignmentService.listTeacherAssignments(query);
    res.status(200).json(assignments);
  })().catch(next);
}

export function removeTeacherAssignment(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    await teacherAssignmentService.removeTeacherAssignment(req.params.id as string);
    res.status(204).send();
  })().catch(next);
}
