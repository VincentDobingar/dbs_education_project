import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as homeworkService from "./homework.service.js";
import {
  createHomeworkSchema,
  listHomeworkQuerySchema,
  submitHomeworkSchema,
  updateHomeworkSchema,
} from "./homework.validation.js";

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
  }
  return req.user.id;
}

export function createHomework(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const userId = requireUserId(req);
    const input = createHomeworkSchema.parse(req.body);
    const homework = await homeworkService.createHomework(input, userId);
    res.status(201).json(homework);
  })().catch(next);
}

export function listHomework(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listHomeworkQuerySchema.parse(req.query);
    const homework = await homeworkService.listHomework(query);
    res.status(200).json(homework);
  })().catch(next);
}

export function getHomework(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const homework = await homeworkService.requireHomework(req.params.id as string);
    res.status(200).json(homework);
  })().catch(next);
}

export function updateHomework(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateHomeworkSchema.parse(req.body);
    const homework = await homeworkService.updateHomework(req.params.id as string, input);
    res.status(200).json(homework);
  })().catch(next);
}

export function cancelHomework(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    await homeworkService.cancelHomework(req.params.id as string);
    res.status(204).send();
  })().catch(next);
}

export function listSubmissions(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const submissions = await homeworkService.listSubmissionsForHomework(req.params.id as string);
    res.status(200).json(submissions);
  })().catch(next);
}

// §25/§26 : dépôt de travaux, self-service élève.

export function listHomeworkForStudent(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const homework = await homeworkService.listHomeworkForStudent(req.params.studentId as string);
    res.status(200).json(homework);
  })().catch(next);
}

export function submitHomework(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = submitHomeworkSchema.parse(req.body);
    const submission = await homeworkService.submitHomework(
      req.params.studentId as string,
      req.params.homeworkId as string,
      input,
    );
    res.status(200).json(submission);
  })().catch(next);
}

export function getMySubmission(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const submission = await homeworkService.getMySubmission(
      req.params.studentId as string,
      req.params.homeworkId as string,
    );
    if (!submission) {
      res.status(404).json({ code: "SUBMISSION_NOT_FOUND", message: "No submission yet for this homework" });
      return;
    }
    res.status(200).json(submission);
  })().catch(next);
}
