import type { Announcement, AnnouncementAudience } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";
import { requireCurrentEnrollment } from "../students/student.service.js";

import type { CreateAnnouncementInput, ListAnnouncementsQuery } from "./announcement.validation.js";

export async function createAnnouncement(
  input: CreateAnnouncementInput,
  actingUserId: string,
): Promise<Announcement> {
  if (input.classroomId) {
    const classroom = await prisma.classroom.findUnique({ where: { id: input.classroomId } });
    if (!classroom) {
      throw new AppError(404, "CLASSROOM_NOT_FOUND", `Classroom not found: ${input.classroomId}`);
    }
  }

  return prisma.announcement.create({
    data: {
      tenantId: requireCurrentTenantId(),
      title: input.title,
      body: input.body,
      audienceScope: input.audienceScope,
      createdByUserId: actingUserId,
      publishedAt: input.publishedAt ?? new Date(),
      ...(input.classroomId ? { classroomId: input.classroomId } : {}),
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    },
  });
}

export async function listAnnouncements(query: ListAnnouncementsQuery): Promise<Announcement[]> {
  return prisma.announcement.findMany({
    where: { deletedAt: null, ...(query.classroomId ? { classroomId: query.classroomId } : {}) },
    orderBy: { publishedAt: "desc" },
  });
}

async function requireAnnouncement(id: string): Promise<Announcement> {
  const announcement = await prisma.announcement.findUnique({ where: { id } });
  if (!announcement || announcement.deletedAt) {
    throw new AppError(404, "ANNOUNCEMENT_NOT_FOUND", `Announcement not found: ${id}`);
  }
  return announcement;
}

export async function removeAnnouncement(id: string): Promise<void> {
  await requireAnnouncement(id);
  await prisma.announcement.update({ where: { id }, data: { deletedAt: new Date() } });
}

/**
 * §25/§26 : annonces visibles pour un enfant donné, du point de vue d'un parent
 * (`audience: "PARENTS"`) ou de l'élève lui-même (`"STUDENTS"`) — audience ALL ou
 * la catégorie du spectateur, ou CLASSROOM si elle correspond à la classe actuelle
 * de l'élève, publiées et non expirées.
 */
export async function listAnnouncementsForStudent(
  studentId: string,
  audience: Extract<AnnouncementAudience, "PARENTS" | "STUDENTS">,
): Promise<Announcement[]> {
  const enrollment = await requireCurrentEnrollment(studentId);
  const now = new Date();

  return prisma.announcement.findMany({
    where: {
      deletedAt: null,
      publishedAt: { lte: now },
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
        {
          OR: [
            { audienceScope: { in: ["ALL", audience] } },
            { audienceScope: "CLASSROOM", classroomId: enrollment.classroomId },
          ],
        },
      ],
    },
    orderBy: { publishedAt: "desc" },
  });
}
