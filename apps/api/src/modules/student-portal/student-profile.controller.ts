import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { AppError } from "../../lib/errors.js";
import { saveUploadedImage } from "../../lib/file-storage.js";
import { prisma } from "../../lib/prisma.js";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
export const studentProfileSchema = z
  .object({
    address: optionalText(240),
    phone: optionalText(40),
    birthPlace: optionalText(120),
    nationality: optionalText(80),
    emergencyContactName: optionalText(120),
    emergencyContactPhone: optionalText(40),
  })
  .strict();
export function updateMyProfile(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    const data = studentProfileSchema.parse(req.body);
    const student = await prisma.student.update({
      where: { id: req.params.studentId as string },
      data: {
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.birthPlace !== undefined ? { birthPlace: data.birthPlace } : {}),
        ...(data.nationality !== undefined ? { nationality: data.nationality } : {}),
        ...(data.emergencyContactName !== undefined
          ? { emergencyContactName: data.emergencyContactName }
          : {}),
        ...(data.emergencyContactPhone !== undefined
          ? { emergencyContactPhone: data.emergencyContactPhone }
          : {}),
      },
      omit: { medicalNotes: true },
    });
    res.json(student);
  })().catch(next);
}
export function uploadMyPhoto(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (!req.file)
      throw new AppError(400, "PHOTO_REQUIRED", "Choisissez une photo JPEG ou PNG (3 Mo maximum).");
    const photoUrl = await saveUploadedImage(req.file.buffer, req.file.mimetype, "student-photos");
    const student = await prisma.student.update({
      where: { id: req.params.studentId as string },
      data: { photoUrl },
      omit: { medicalNotes: true },
    });
    res.json({ photoUrl: student.photoUrl });
  })().catch(next);
}
