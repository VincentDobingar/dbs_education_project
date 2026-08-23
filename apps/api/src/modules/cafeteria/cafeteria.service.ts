import type { MealAttendance, MealPlan, Menu, StudentMealEnrollment } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";
import { requireStudentRecord } from "../students/student.service.js";

import type {
  CreateEnrollmentInput,
  CreateMealPlanInput,
  CreateMenuInput,
  ListEnrollmentsQuery,
  ListMealAttendanceQuery,
  ListMenusQuery,
  RecordMealAttendanceInput,
  UpdateMealPlanInput,
  UpdateMenuInput,
} from "./cafeteria.validation.js";

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function createMenu(input: CreateMenuInput): Promise<Menu> {
  const date = startOfDay(input.date);
  const existing = await prisma.menu.findFirst({ where: { date } });
  if (existing) {
    throw new AppError(409, "MENU_ALREADY_EXISTS", `A menu already exists for ${date.toISOString()}`);
  }

  return prisma.menu.create({
    data: { tenantId: requireCurrentTenantId(), date, description: input.description },
  });
}

export async function listMenus(query: ListMenusQuery): Promise<Menu[]> {
  return prisma.menu.findMany({
    where: {
      ...(query.startDate || query.endDate
        ? {
            date: {
              ...(query.startDate ? { gte: startOfDay(query.startDate) } : {}),
              ...(query.endDate ? { lte: startOfDay(query.endDate) } : {}),
            },
          }
        : {}),
    },
    orderBy: { date: "asc" },
  });
}

export async function requireMenu(id: string): Promise<Menu> {
  const menu = await prisma.menu.findUnique({ where: { id } });
  if (!menu) {
    throw new AppError(404, "MENU_NOT_FOUND", `Menu not found: ${id}`);
  }
  return menu;
}

export async function updateMenu(id: string, input: UpdateMenuInput): Promise<Menu> {
  await requireMenu(id);
  return prisma.menu.update({ where: { id }, data: { description: input.description } });
}

export async function removeMenu(id: string): Promise<void> {
  await requireMenu(id);
  await prisma.menu.delete({ where: { id } });
}

export async function createMealPlan(input: CreateMealPlanInput): Promise<MealPlan> {
  return prisma.mealPlan.create({
    data: {
      tenantId: requireCurrentTenantId(),
      name: input.name,
      type: input.type,
      priceCents: input.priceCents,
    },
  });
}

export async function listMealPlans(): Promise<MealPlan[]> {
  return prisma.mealPlan.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } });
}

export async function requireMealPlan(id: string): Promise<MealPlan> {
  const mealPlan = await prisma.mealPlan.findUnique({ where: { id } });
  if (!mealPlan || mealPlan.deletedAt) {
    throw new AppError(404, "MEAL_PLAN_NOT_FOUND", `Meal plan not found: ${id}`);
  }
  return mealPlan;
}

export async function updateMealPlan(id: string, input: UpdateMealPlanInput): Promise<MealPlan> {
  await requireMealPlan(id);

  return prisma.mealPlan.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.priceCents !== undefined ? { priceCents: input.priceCents } : {}),
    },
  });
}

export async function archiveMealPlan(id: string): Promise<MealPlan> {
  await requireMealPlan(id);
  return prisma.mealPlan.update({ where: { id }, data: { deletedAt: new Date() } });
}

/**
 * Une seule inscription ACTIVE à la fois par élève (§29) — même simplicité que « un
 * prêt actif par élève et par livre » en bibliothèque : une règle métier vérifiée par
 * requête, pas un chevauchement de dates à calculer. Pour changer de formule, on
 * annule d'abord l'inscription en cours.
 */
export async function createEnrollment(input: CreateEnrollmentInput): Promise<StudentMealEnrollment> {
  await requireStudentRecord(input.studentId);
  await requireMealPlan(input.mealPlanId);

  const activeEnrollment = await prisma.studentMealEnrollment.findFirst({
    where: { studentId: input.studentId, status: "ACTIVE" },
  });
  if (activeEnrollment) {
    throw new AppError(
      409,
      "ENROLLMENT_ALREADY_ACTIVE",
      "This student already has an active meal plan enrollment",
    );
  }

  return prisma.studentMealEnrollment.create({
    data: {
      tenantId: requireCurrentTenantId(),
      studentId: input.studentId,
      mealPlanId: input.mealPlanId,
      startDate: input.startDate,
      ...(input.endDate ? { endDate: input.endDate } : {}),
    },
  });
}

export async function listEnrollments(query: ListEnrollmentsQuery): Promise<StudentMealEnrollment[]> {
  return prisma.studentMealEnrollment.findMany({
    where: {
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.mealPlanId ? { mealPlanId: query.mealPlanId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function requireEnrollment(id: string): Promise<StudentMealEnrollment> {
  const enrollment = await prisma.studentMealEnrollment.findUnique({ where: { id } });
  if (!enrollment) {
    throw new AppError(404, "ENROLLMENT_NOT_FOUND", `Meal plan enrollment not found: ${id}`);
  }
  return enrollment;
}

/** Statut de paiement simple (§29) : pas de facture, pas de lien avec
 * `StudentInvoice`/`FeeStructure` — voir la note de schéma sur `MealPlan`. */
export async function markEnrollmentPaid(id: string): Promise<StudentMealEnrollment> {
  await requireEnrollment(id);
  return prisma.studentMealEnrollment.update({
    where: { id },
    data: { paid: true, paidAt: new Date() },
  });
}

export async function cancelEnrollment(id: string): Promise<StudentMealEnrollment> {
  const enrollment = await requireEnrollment(id);
  if (enrollment.status === "CANCELLED") {
    throw new AppError(409, "ENROLLMENT_ALREADY_CANCELLED", "This enrollment is already cancelled");
  }
  return prisma.studentMealEnrollment.update({ where: { id }, data: { status: "CANCELLED" } });
}

/** Suivi des repas (§29) : upsert par jour sur `@@unique([enrollmentId, date])` —
 * aucune colonne nullable dans cette contrainte, même raisonnement que
 * `recordStaffAttendance`/`recordTransportAttendance`. */
export async function recordMealAttendance(
  enrollmentId: string,
  input: RecordMealAttendanceInput,
): Promise<MealAttendance> {
  const enrollment = await requireEnrollment(enrollmentId);
  const date = startOfDay(input.date);

  return prisma.mealAttendance.upsert({
    where: { enrollmentId_date: { enrollmentId, date } },
    create: { tenantId: enrollment.tenantId, enrollmentId, date, status: input.status },
    update: { status: input.status },
  });
}

export async function listMealAttendanceForEnrollment(
  enrollmentId: string,
  query: ListMealAttendanceQuery,
): Promise<MealAttendance[]> {
  await requireEnrollment(enrollmentId);
  return prisma.mealAttendance.findMany({
    where: { enrollmentId, ...(query.date ? { date: startOfDay(query.date) } : {}) },
    orderBy: { date: "desc" },
  });
}
