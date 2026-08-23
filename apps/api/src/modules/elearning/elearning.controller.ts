import type { NextFunction, Request, Response } from "express";

import { AppError } from "../../lib/errors.js";

import * as elearningService from "./elearning.service.js";
import {
  createCourseSchema,
  createResourceSchema,
  listCoursesQuerySchema,
  updateCourseSchema,
} from "./elearning.validation.js";

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new AppError(401, "UNAUTHENTICATED", "requireAuth must run first");
  }
  return req.user.id;
}

export function createCourse(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const userId = requireUserId(req);
    const input = createCourseSchema.parse(req.body);
    const course = await elearningService.createCourse(input, userId);
    res.status(201).json(course);
  })().catch(next);
}

export function listCourses(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const query = listCoursesQuerySchema.parse(req.query);
    const courses = await elearningService.listCourses(query);
    res.status(200).json(courses);
  })().catch(next);
}

export function getCourse(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const course = await elearningService.requireCourse(req.params.id as string);
    res.status(200).json(course);
  })().catch(next);
}

export function updateCourse(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = updateCourseSchema.parse(req.body);
    const course = await elearningService.updateCourse(req.params.id as string, input);
    res.status(200).json(course);
  })().catch(next);
}

export function cancelCourse(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    await elearningService.cancelCourse(req.params.id as string);
    res.status(204).send();
  })().catch(next);
}

export function addResource(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const input = createResourceSchema.parse(req.body);
    const resource = await elearningService.addResource(req.params.id as string, input);
    res.status(201).json(resource);
  })().catch(next);
}

export function listResources(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const resources = await elearningService.listResourcesForCourse(req.params.id as string);
    res.status(200).json(resources);
  })().catch(next);
}

export function removeResource(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    await elearningService.removeResource(req.params.id as string, req.params.resourceId as string);
    res.status(204).send();
  })().catch(next);
}

export function listProgress(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const progress = await elearningService.listProgressForCourse(req.params.id as string);
    res.status(200).json(progress);
  })().catch(next);
}

// §25/§26 : consultation et suivi de progression, self-service élève.

export function listCoursesForStudent(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const courses = await elearningService.listCoursesForStudent(req.params.studentId as string);
    res.status(200).json(courses);
  })().catch(next);
}

export function getCourseForStudent(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const course = await elearningService.getCourseForStudent(
      req.params.studentId as string,
      req.params.courseId as string,
    );
    res.status(200).json(course);
  })().catch(next);
}

export function markResourceComplete(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const progress = await elearningService.markResourceComplete(
      req.params.studentId as string,
      req.params.courseId as string,
      req.params.resourceId as string,
    );
    res.status(200).json(progress);
  })().catch(next);
}
