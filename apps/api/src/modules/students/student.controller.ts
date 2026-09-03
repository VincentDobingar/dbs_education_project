import type { NextFunction, Request, Response } from "express";

import * as studentService from "./student.service.js";
import {
  checkDuplicateStudentsQuerySchema,
  createStudentSchema,
  listStudentsQuerySchema,
  updateStudentSchema,
} from "./student.validation.js";

export function createStudent(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createStudentSchema.parse(req.body);
    const student = await studentService.createStudent(input);
    res.status(201).json(student);
  })().catch(next);
}

export function checkDuplicateStudents(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = checkDuplicateStudentsQuerySchema.parse(req.query);
    const duplicates = await studentService.checkDuplicateStudents(
      query.firstName,
      query.lastName,
      query.dateOfBirth,
    );
    res.status(200).json(duplicates);
  })().catch(next);
}

export function listStudents(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listStudentsQuerySchema.parse(req.query);
    const students = await studentService.listStudents(query);
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
