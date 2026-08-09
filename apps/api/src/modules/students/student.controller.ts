import type { NextFunction, Request, Response } from "express";

import * as studentService from "./student.service.js";
import { createStudentSchema, updateStudentSchema } from "./student.validation.js";

export function createStudent(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createStudentSchema.parse(req.body);
    const student = await studentService.createStudent(input);
    res.status(201).json(student);
  })().catch(next);
}

export function listStudents(_req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const students = await studentService.listStudents();
    res.status(200).json(students);
  })().catch(next);
}

export function getStudent(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const student = await studentService.getStudent(req.params.id as string);
    res.status(200).json(student);
  })().catch(next);
}

export function updateStudent(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateStudentSchema.parse(req.body);
    const student = await studentService.updateStudent(req.params.id as string, input);
    res.status(200).json(student);
  })().catch(next);
}

export function archiveStudent(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const student = await studentService.archiveStudent(req.params.id as string);
    res.status(200).json(student);
  })().catch(next);
}
