import type { Homework, HomeworkSubmission } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";
import { requireCurrentEnrollment } from "../students/student.service.js";

import type {
  CreateHomeworkInput,
  ListHomeworkQuery,
  SubmitHomeworkInput,
  UpdateHomeworkInput,
} from "./homework.validation.js";

/** Never trust a client-supplied employee id for "who assigned this homework". */
async function resolveActingEmployeeId(userId: string): Promise<string | undefined> {
  const employee = await prisma.employee.findFirst({ where: { userId } });
  return employee?.id;
}

export async function createHomework(input: CreateHomeworkInput, actingUserId: string): Promise<Homework> {
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

  return prisma.homework.create({
    data: {
      tenantId: requireCurrentTenantId(),
      classroomId: input.classroomId,
      subjectId: input.subjectId,
      title: input.title,
      dueAt: input.dueAt,
      ...(input.instructions ? { instructions: input.instructions } : {}),
      ...(createdByEmployeeId ? { createdByEmployeeId } : {}),
    },
  });
}

export async function listHomework(query: ListHomeworkQuery): Promise<Homework[]> {
  return prisma.homework.findMany({
    where: {
      deletedAt: null,
      ...(query.classroomId ? { classroomId: query.classroomId } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
    },
    orderBy: { dueAt: "asc" },
  });
}

export async function requireHomework(id: string): Promise<Homework> {
  const homework = await prisma.homework.findUnique({ where: { id } });
  if (!homework || homework.deletedAt) {
    throw new AppError(404, "HOMEWORK_NOT_FOUND", `Homework not found: ${id}`);
  }
  return homework;
}

export async function updateHomework(id: string, input: UpdateHomeworkInput): Promise<Homework> {
  await requireHomework(id);

  return prisma.homework.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
    },
  });
}

export async function cancelHomework(id: string): Promise<void> {
  await requireHomework(id);
  await prisma.homework.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function listSubmissionsForHomework(homeworkId: string): Promise<HomeworkSubmission[]> {
  await requireHomework(homeworkId);
  return prisma.homeworkSubmission.findMany({
    where: { homeworkId },
    orderBy: { submittedAt: "desc" },
  });
}

/** §26 : devoirs de la classe courante de l'élève — jamais un classroomId fourni par
 * le client, même principe que le timetable/les annonces du portail élève. */
export async function listHomeworkForStudent(studentId: string): Promise<Homework[]> {
  const enrollment = await requireCurrentEnrollment(studentId);
  return listHomework({ classroomId: enrollment.classroomId });
}

/** Never confirm the existence of homework outside the student's own current
 * classroom (404, not 403) — same convention as report cards/receipts elsewhere. */
async function requireHomeworkForStudent(studentId: string, homeworkId: string): Promise<Homework> {
  const enrollment = await requireCurrentEnrollment(studentId);
  const homework = await requireHomework(homeworkId);
  if (homework.classroomId !== enrollment.classroomId) {
    throw new AppError(404, "HOMEWORK_NOT_FOUND", `Homework not found: ${homeworkId}`);
  }
  return homework;
}

/**
 * Un redépôt met à jour la soumission existante plutôt que d'en créer une seconde
 * (@@unique([homeworkId, studentId])) — même raisonnement que l'appel idempotent du
 * roll call (§22). Le statut "en retard" est calculé côté serveur à l'instant du
 * dépôt, jamais fourni par le client.
 */
export async function submitHomework(
  studentId: string,
  homeworkId: string,
  input: SubmitHomeworkInput,
): Promise<HomeworkSubmission> {
  const homework = await requireHomeworkForStudent(studentId, homeworkId);

  const submittedAt = new Date();
  const status = submittedAt > homework.dueAt ? "LATE" : "ON_TIME";

  return prisma.homeworkSubmission.upsert({
    where: { homeworkId_studentId: { homeworkId, studentId } },
    update: {
      ...(input.content !== undefined ? { content: input.content } : {}),
      ...(input.fileUrl !== undefined ? { fileUrl: input.fileUrl } : {}),
      status,
      submittedAt,
    },
    create: {
      tenantId: requireCurrentTenantId(),
      homeworkId,
      studentId,
      ...(input.content ? { content: input.content } : {}),
      ...(input.fileUrl ? { fileUrl: input.fileUrl } : {}),
      status,
      submittedAt,
    },
  });
}

/** Never confirm the existence of another student's submission (404, not 403). */
export async function getMySubmission(
  studentId: string,
  homeworkId: string,
): Promise<HomeworkSubmission | null> {
  await requireHomeworkForStudent(studentId, homeworkId);
  return prisma.homeworkSubmission.findUnique({
    where: { homeworkId_studentId: { homeworkId, studentId } },
  });
}
