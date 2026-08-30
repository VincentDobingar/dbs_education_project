import type { CourseResource, OnlineCourse, ResourceProgress } from "@prisma/client";

import { resolveActingEmployeeId } from "../../lib/acting-employee.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";
import { requireCurrentEnrollment } from "../students/student.service.js";

import type {
  CreateCourseInput,
  CreateResourceInput,
  ListCoursesQuery,
  UpdateCourseInput,
} from "./elearning.validation.js";

export async function createCourse(input: CreateCourseInput, actingUserId: string): Promise<OnlineCourse> {
  const [subject, classroom] = await Promise.all([
    prisma.subject.findUnique({ where: { id: input.subjectId } }),
    prisma.classroom.findUnique({ where: { id: input.classroomId } }),
  ]);
  if (!subject) {
    throw new AppError(404, "SUBJECT_NOT_FOUND", `Subject not found: ${input.subjectId}`);
  }
  if (!classroom) {
    throw new AppError(404, "CLASSROOM_NOT_FOUND", `Classroom not found: ${input.classroomId}`);
  }

  const createdByEmployeeId = await resolveActingEmployeeId(actingUserId);
  if (!createdByEmployeeId) {
    throw new AppError(
      403,
      "EMPLOYEE_RECORD_REQUIRED",
      "Only a staff member with a linked employee record can create a course",
    );
  }

  return prisma.onlineCourse.create({
    data: {
      tenantId: requireCurrentTenantId(),
      classroomId: input.classroomId,
      subjectId: input.subjectId,
      title: input.title,
      ...(input.description ? { description: input.description } : {}),
      ...(createdByEmployeeId ? { createdByEmployeeId } : {}),
    },
  });
}

export async function listCourses(query: ListCoursesQuery): Promise<OnlineCourse[]> {
  return prisma.onlineCourse.findMany({
    where: {
      deletedAt: null,
      ...(query.classroomId ? { classroomId: query.classroomId } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function requireCourse(id: string): Promise<OnlineCourse> {
  const course = await prisma.onlineCourse.findUnique({ where: { id } });
  if (!course || course.deletedAt) {
    throw new AppError(404, "COURSE_NOT_FOUND", `Online course not found: ${id}`);
  }
  return course;
}

export async function updateCourse(id: string, input: UpdateCourseInput): Promise<OnlineCourse> {
  await requireCourse(id);

  return prisma.onlineCourse.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
  });
}

export async function cancelCourse(id: string): Promise<void> {
  await requireCourse(id);
  await prisma.onlineCourse.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function addResource(courseId: string, input: CreateResourceInput): Promise<CourseResource> {
  const course = await requireCourse(courseId);

  return prisma.courseResource.create({
    data: {
      tenantId: course.tenantId,
      courseId,
      title: input.title,
      type: input.type,
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.order !== undefined ? { order: input.order } : {}),
    },
  });
}

export async function listResourcesForCourse(courseId: string): Promise<CourseResource[]> {
  await requireCourse(courseId);
  return prisma.courseResource.findMany({ where: { courseId }, orderBy: { order: "asc" } });
}

async function requireResource(courseId: string, id: string): Promise<CourseResource> {
  const resource = await prisma.courseResource.findUnique({ where: { id } });
  if (!resource || resource.courseId !== courseId) {
    throw new AppError(404, "RESOURCE_NOT_FOUND", `Resource not found: ${id}`);
  }
  return resource;
}

export async function removeResource(courseId: string, id: string): Promise<void> {
  await requireResource(courseId, id);
  await prisma.courseResource.delete({ where: { id } });
}

/** Suivi de progression (§29) : seules les consultations réelles sont renvoyées,
 * jamais une ligne fabriquée à zéro pour un élève qui n'a encore rien terminé —
 * même raisonnement que `listSubmissionsForHomework`. */
export async function listProgressForCourse(courseId: string): Promise<ResourceProgress[]> {
  await requireCourse(courseId);
  return prisma.resourceProgress.findMany({
    where: { resource: { courseId } },
    orderBy: { completedAt: "desc" },
  });
}

/** §26 : cours en ligne de la classe courante de l'élève — jamais un classroomId
 * fourni par le client, même principe que le timetable/les devoirs du portail élève. */
export async function listCoursesForStudent(studentId: string): Promise<OnlineCourse[]> {
  const enrollment = await requireCurrentEnrollment(studentId);
  return listCourses({ classroomId: enrollment.classroomId });
}

/** Never confirm the existence of a course outside the student's own current
 * classroom (404, not 403) — same convention as report cards/receipts/homework. */
async function requireCourseForStudent(studentId: string, courseId: string): Promise<OnlineCourse> {
  const enrollment = await requireCurrentEnrollment(studentId);
  const course = await requireCourse(courseId);
  if (course.classroomId !== enrollment.classroomId) {
    throw new AppError(404, "COURSE_NOT_FOUND", `Online course not found: ${courseId}`);
  }
  return course;
}

export interface CourseWithProgress extends OnlineCourse {
  resources: CourseResource[];
  completedResourceIds: string[];
}

export async function getCourseForStudent(studentId: string, courseId: string): Promise<CourseWithProgress> {
  const course = await requireCourseForStudent(studentId, courseId);
  const resources = await prisma.courseResource.findMany({ where: { courseId }, orderBy: { order: "asc" } });
  const progress = await prisma.resourceProgress.findMany({
    where: { studentId, resource: { courseId } },
    select: { resourceId: true },
  });

  return { ...course, resources, completedResourceIds: progress.map((p) => p.resourceId) };
}

/**
 * Marquer une ressource terminée est idempotent (upsert sur
 * `@@unique([resourceId, studentId])`) — la revisiter met juste à jour la date,
 * jamais un doublon, même raisonnement que `submitHomework`.
 */
export async function markResourceComplete(
  studentId: string,
  courseId: string,
  resourceId: string,
): Promise<ResourceProgress> {
  await requireCourseForStudent(studentId, courseId);
  const resource = await requireResource(courseId, resourceId);

  return prisma.resourceProgress.upsert({
    where: { resourceId_studentId: { resourceId, studentId } },
    update: { completedAt: new Date() },
    create: { tenantId: resource.tenantId, resourceId, studentId },
  });
}
