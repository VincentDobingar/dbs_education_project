import type { NextFunction, Request, Response } from "express";

import { userHasPermission } from "../../lib/authorization.js";
import { AppError } from "../../lib/errors.js";

import * as enrollmentService from "./enrollment.service.js";
import { createEnrollmentSchema, updateEnrollmentStatusSchema } from "./enrollment.validation.js";

export function enrollStudent(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createEnrollmentSchema.parse(req.body);
    await assertManualDiscountsAllowed(req, input.manualDiscounts);
    const enrollment = await enrollmentService.enrollStudent(
      req.params.studentId as string,
      input,
      req.user!.id,
    );
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

async function assertManualDiscountsAllowed(req: Request, manual: unknown[] | undefined): Promise<void> {
  if (!manual || manual.length === 0) return;
  if (!(await userHasPermission(req.user!.id, req.tenant?.id ?? null, "finance.exceptions"))) {
    throw new AppError(
      403,
      "MANUAL_DISCOUNT_NOT_ALLOWED",
      "Seule la direction peut accorder une remise au cas par cas",
    );
  }
}

export function previewEnrollment(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createEnrollmentSchema.parse(req.body);
    await assertManualDiscountsAllowed(req, input.manualDiscounts);
    res.status(200).json(await enrollmentService.previewEnrollment(req.params.studentId as string, input));
  })().catch(next);
}
