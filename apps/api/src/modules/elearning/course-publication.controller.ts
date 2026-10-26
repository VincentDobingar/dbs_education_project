import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

import type { Request, Response, NextFunction } from "express";
import multer from "multer";
import { z } from "zod";

import { env } from "../../env.js";
import { getTenantRoleCodes } from "../../lib/authorization.js";
import { AppError } from "../../lib/errors.js";
import { prisma, withTenantSession } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import * as learning from "./elearning.service.js";

const privateDirectory = path.resolve(env.UPLOAD_DIR, "..", "private-course-files");
export const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});
function action(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req, res).catch(next);
  };
}
export const reviewCourse = action(async (req, res) => {
  const roles = await getTenantRoleCodes(req.user!.id, requireCurrentTenantId());
  if (!roles.some((r) => ["SCHOOL_OWNER", "SCHOOL_ADMIN", "DIRECTOR", "ACADEMIC_DIRECTOR"].includes(r)))
    throw new AppError(403, "COURSE_REVIEW_ADMIN_REQUIRED", "La validation est réservée à l'administration.");
  const input = z
    .object({ status: z.enum(["APPROVED", "REJECTED"]), comment: z.string().trim().max(1000).optional() })
    .refine((value) => value.status !== "REJECTED" || !!value.comment, {
      path: ["comment"],
      message: "Un motif est obligatoire pour refuser un cours.",
    })
    .parse(req.body);
  const course = await learning.requireCourse(req.params.id as string);
  return res.json(
    await withTenantSession(course.tenantId, async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "OnlineCourse" WHERE "id" = ${course.id} FOR UPDATE`;
      const current = await tx.onlineCourse.findUnique({ where: { id: course.id } });
      if (!current || current.deletedAt) throw new AppError(404, "COURSE_NOT_FOUND", "Cours introuvable");
      const comment = input.comment || null;
      if (current.approvalStatus === input.status && current.reviewComment === comment) return current;
      const updated = await tx.onlineCourse.update({
        where: { id: course.id },
        data: {
          approvalStatus: input.status,
          reviewedByUserId: req.user!.id,
          reviewedAt: new Date(),
          reviewComment: comment,
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId: course.tenantId,
          actorUserId: req.user!.id,
          action: "course.review",
          entityType: "OnlineCourse",
          entityId: course.id,
          afterData: { status: input.status, comment },
        },
      });
      const author = current.createdByEmployeeId
        ? await tx.employee.findFirst({
            where: {
              id: current.createdByEmployeeId,
              tenantId: course.tenantId,
              deletedAt: null,
              status: { not: "TERMINATED" },
            },
          })
        : null;
      if (author?.userId) {
        const recipient = await tx.user.findFirst({ where: { id: author.userId, status: "ACTIVE" } });
        const membership = await tx.tenantMembership.findFirst({
          where: { userId: author.userId, tenantId: course.tenantId, status: "ACTIVE" },
        });
        if (recipient && membership)
          await tx.notification.create({
            data: {
              tenantId: course.tenantId,
              userId: recipient.id,
              channel: "IN_APP",
              status: "SENT",
              sentAt: new Date(),
              type: input.status === "APPROVED" ? "course.review.approved" : "course.review.rejected",
              title: input.status === "APPROVED" ? "Cours validé" : "Cours refusé",
              body:
                input.status === "APPROVED"
                  ? `Votre cours « ${current.title} » a été validé et est visible des élèves et de leurs parents.`
                  : `Votre cours « ${current.title} » a été refusé. Motif : ${comment ?? ""}`,
              metadata: { courseId: current.id, approvalStatus: input.status, comment },
            },
          });
      }
      return updated;
    }),
  );
});
export const uploadPdf = action(async (req, res) => {
  const course = await learning.requireCourse(req.params.id as string);
  const file = req.file;
  if (
    !file ||
    file.mimetype !== "application/pdf" ||
    file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-"
  )
    throw new AppError(400, "PDF_REQUIRED", "Sélectionnez un fichier PDF valide (10 Mo maximum).");
  const { title } = z.object({ title: z.string().trim().min(1).max(200) }).parse(req.body);
  const key = `${randomBytes(24).toString("hex")}.pdf`;
  await mkdir(privateDirectory, { recursive: true });
  await writeFile(path.join(privateDirectory, key), file.buffer);
  return res
    .status(201)
    .json(
      await learning.addResource(
        course.id,
        { title, type: "DOCUMENT", content: "Support de cours PDF" },
        key,
      ),
    );
});
async function sendPdf(req: Request, res: Response, student: boolean) {
  const courseId = (req.params.courseId ?? req.params.id) as string;
  if (student) await learning.getCourseForStudent(req.params.studentId as string, courseId);
  else await learning.requireCourse(courseId);
  const resource = await prisma.courseResource.findFirst({
    where: { id: req.params.resourceId as string, courseId },
  });
  if (!resource?.fileKey || !/^[a-f0-9]{48}\.pdf$/.test(resource.fileKey))
    throw new AppError(404, "RESOURCE_NOT_FOUND", "PDF introuvable");
  const bytes = await readFile(path.join(privateDirectory, resource.fileKey));
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": 'attachment; filename="cours.pdf"',
    "Cache-Control": "private, no-store",
  });
  return res.send(bytes);
}
export const staffPdf = action((req, res) => sendPdf(req, res, false));
export const familyPdf = action((req, res) => sendPdf(req, res, true));
export const familyCourses = action(async (req, res) =>
  res.json(await learning.listCoursesForStudent(req.params.studentId as string)),
);
export const familyCourse = action(async (req, res) =>
  res.json(await learning.getCourseForStudent(req.params.studentId as string, req.params.courseId as string)),
);
