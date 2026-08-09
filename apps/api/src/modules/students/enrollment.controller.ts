import type { NextFunction, Request, Response } from "express";

import * as enrollmentService from "./enrollment.service.js";
import { createEnrollmentSchema, updateEnrollmentStatusSchema } from "./enrollment.validation.js";

export function enrollStudent(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createEnrollmentSchema.parse(req.body);
    const enrollment = await enrollmentService.enrollStudent(req.params.studentId as string, input);
    res.status(201).json(enrollment);
  })().catch(next);
}

export function listEnrollments(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const enrollments = await enrollmentService.listEnrollmentsForStudent(req.params.studentId as string);
    res.status(200).json(enrollments);
  })().catch(next);
}

export function updateEnrollmentStatus(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateEnrollmentStatusSchema.parse(req.body);
    const enrollment = await enrollmentService.updateEnrollmentStatus(
      req.params.studentId as string,
      req.params.id as string,
      input,
    );
    res.status(200).json(enrollment);
  })().catch(next);
}
