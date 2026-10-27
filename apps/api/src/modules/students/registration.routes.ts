import { Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import { AppError } from "../../lib/errors.js";
import { saveUploadedImage } from "../../lib/file-storage.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";
import { imageUpload } from "../../lib/upload-middleware.js";
import { enforceTenantScope } from "../../middleware/enforceTenantScope.js";
import { requireActiveSubscription } from "../../middleware/requireActiveSubscription.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requirePermission } from "../../middleware/requirePermission.js";
import { requireTenantMembership } from "../../middleware/requireTenantMembership.js";
import { updateParentFromSchool } from "../parent-portal/parent-profile.service.js";

import { guardianSchema, registrationPeriodSchema } from "./registration.validation.js";

export const registrationRouter: Router = Router();
registrationRouter.use(requireAuth, enforceTenantScope, requireTenantMembership, requireActiveSubscription());
const read = requirePermission("students.read");
const write = requirePermission("students.write");
function action(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req, res).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        next(
          new AppError(
            409,
            "REGISTRATION_RECORD_EXISTS",
            "Une période portant ce nom existe déjà pour cette année",
          ),
        );
      } else next(error);
    });
  };
}
registrationRouter.get(
  "/guardians",
  read,
  action(async (_req, res) => {
    return res.json(
      await prisma.schoolGuardian.findMany({
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        include: {
          students: {
            where: { deletedAt: null },
            select: { id: true, firstName: true, lastName: true, matricule: true },
          },
        },
      }),
    );
  }),
);
registrationRouter.post(
  "/guardians",
  write,
  action(async (req, res) => {
    const input = guardianSchema.parse(req.body);
    return res.status(201).json(
      await prisma.schoolGuardian.create({
        data: {
          ...input,
          email: input.email ?? null,
          address: input.address ?? null,
          tenantId: requireCurrentTenantId(),
        },
      }),
    );
  }),
);
registrationRouter.patch(
  "/guardians/:id",
  write,
  action(async (req, res) => {
    const id = req.params.id as string;
    const guardian = await prisma.schoolGuardian.findUnique({ where: { id } });
    if (!guardian) throw new AppError(404, "GUARDIAN_NOT_FOUND", "Tuteur introuvable");
    const input = guardianSchema.parse(req.body);
    return res.json(
      await updateParentFromSchool(
        id,
        { ...input, email: input.email ?? null, address: input.address ?? null },
        req.user!.id,
      ),
    );
  }),
);
registrationRouter.get(
  "/periods",
  read,
  action(async (_req, res) => {
    return res.json(
      await prisma.registrationPeriod.findMany({
        orderBy: { startDate: "desc" },
        include: { academicYear: true },
      }),
    );
  }),
);
registrationRouter.post(
  "/periods",
  write,
  action(async (req, res) => {
    const input = registrationPeriodSchema.parse(req.body);
    const year = await prisma.academicYear.findUnique({ where: { id: input.academicYearId } });
    if (!year || year.deletedAt)
      throw new AppError(404, "ACADEMIC_YEAR_NOT_FOUND", "Année académique introuvable");
    // Sans plan d'échéances pour l'année, la période porte elle-même ses 1 à 3 tranches.
    if (
      input.installments.length === 0 &&
      (await prisma.feePlan.count({ where: { academicYearId: year.id } })) === 0
    )
      throw new AppError(
        400,
        "REGISTRATION_INSTALLMENTS_REQUIRED",
        "Définissez 1 à 3 tranches, ou créez d'abord un plan d'échéances pour cette année",
      );
    return res.status(201).json(
      await prisma.registrationPeriod.create({
        data: { ...input, tenantId: requireCurrentTenantId() },
      }),
    );
  }),
);
registrationRouter.patch(
  "/periods/:id",
  write,
  action(async (req, res) => {
    const id = req.params.id as string;
    const input = z.object({ isOpen: z.boolean() }).parse(req.body);
    if (!(await prisma.registrationPeriod.findUnique({ where: { id } })))
      throw new AppError(404, "REGISTRATION_PERIOD_NOT_FOUND", "Période introuvable");
    return res.json(await prisma.registrationPeriod.update({ where: { id }, data: input }));
  }),
);
registrationRouter.get(
  "/enrollments",
  read,
  action(async (req, res) => {
    const query = z
      .object({ academicYearId: z.string().optional(), registrationPeriodId: z.string().optional() })
      .parse(req.query);
    return res.json(
      await prisma.enrollment.findMany({
        where: {
          ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
          ...(query.registrationPeriodId ? { registrationPeriodId: query.registrationPeriodId } : {}),
          deletedAt: null,
        },
        orderBy: { enrolledAt: "desc" },
        include: {
          student: {
            select: { id: true, matricule: true, firstName: true, lastName: true, primaryGuardian: true },
          },
          classroom: true,
          academicYear: true,
          registrationPeriod: true,
        },
      }),
    );
  }),
);

/** Remises prédéfinies proposables à l'inscription (le secrétariat n'a pas accès aux finances). */
registrationRouter.get(
  "/discount-presets",
  read,
  action(async (_req, res) => {
    return res.json(
      await prisma.feeDiscountPreset.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    );
  }),
);
/** L'année utilise-t-elle les plans d'échéances (sinon l'ancien échéancier de période) ? */
registrationRouter.get(
  "/fee-mode",
  read,
  action(async (req, res) => {
    const query = z.object({ academicYearId: z.string().min(1) }).parse(req.query);
    const plans = await prisma.feePlan.findMany({
      where: { academicYearId: query.academicYearId },
      select: { id: true, name: true, educationCycleId: true },
    });
    return res.json({ usesPlans: plans.length > 0, plans });
  }),
);

registrationRouter.post(
  "/guardians/:id/photo",
  write,
  imageUpload.single("photo"),
  action(async (req, res) => {
    const id = req.params.id as string;
    if (!(await prisma.schoolGuardian.findUnique({ where: { id } })))
      throw new AppError(404, "GUARDIAN_NOT_FOUND", "Tuteur introuvable");
    if (!req.file)
      throw new AppError(400, "PHOTO_REQUIRED", "Choisissez une image JPEG ou PNG (3 Mo maximum).");
    const photoUrl = await saveUploadedImage(req.file.buffer, req.file.mimetype, "guardian-photos");
    return res.json(await updateParentFromSchool(id, { photoUrl }, req.user!.id));
  }),
);
