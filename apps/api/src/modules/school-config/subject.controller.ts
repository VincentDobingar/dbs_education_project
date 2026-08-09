import type { NextFunction, Request, Response } from "express";

import * as subjectService from "./subject.service.js";
import { createDepartmentSchema, createSubjectSchema, updateSubjectSchema } from "./subject.validation.js";

export function createDepartment(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createDepartmentSchema.parse(req.body);
    const department = await subjectService.createDepartment(input);
    res.status(201).json(department);
  })().catch(next);
}

export function listDepartments(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const departments = await subjectService.listDepartments();
    res.status(200).json(departments);
  })().catch(next);
}

export function createSubject(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createSubjectSchema.parse(req.body);
    const subject = await subjectService.createSubject(input);
    res.status(201).json(subject);
  })().catch(next);
}

export function listSubjects(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const subjects = await subjectService.listSubjects();
    res.status(200).json(subjects);
  })().catch(next);
}

export function updateSubject(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateSubjectSchema.parse(req.body);
    const subject = await subjectService.updateSubject(req.params.id as string, input);
    res.status(200).json(subject);
  })().catch(next);
}
