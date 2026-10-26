import { z } from "zod";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const timetableBreaksSchema = z.object({
  breaks: z
    .array(
      z
        .object({
          label: z.string().trim().min(1).max(80),
          startTime: time,
          endTime: time,
          days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
        })
        .refine(
          (b) => b.startTime < b.endTime && new Set(b.days).size === b.days.length,
          "Horaires ou jours invalides",
        ),
    )
    .max(10),
});
export type TimetableBreak = z.infer<typeof timetableBreaksSchema>["breaks"][number];
export async function getTimetableBreaks(): Promise<TimetableBreak[]> {
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true, deletedAt: null } });
  if (!year) return [];
  const setting = await prisma.tenantSetting.findUnique({
    where: { tenantId_key: { tenantId: requireCurrentTenantId(), key: `timetable.breaks.${year.id}` } },
  });
  return setting ? timetableBreaksSchema.parse(setting.value).breaks : [];
}
export async function saveTimetableBreaks(
  input: z.infer<typeof timetableBreaksSchema>,
  userId: string,
): Promise<TimetableBreak[]> {
  const year = await prisma.academicYear.findFirst({ where: { isCurrent: true, deletedAt: null } });
  if (!year) throw new AppError(400, "CURRENT_YEAR_REQUIRED", "Définissez l'année académique en cours.");
  for (const [i, b] of input.breaks.entries())
    if (
      input.breaks.some(
        (other, j) =>
          j !== i &&
          other.days.some((day) => b.days.includes(day)) &&
          b.startTime < other.endTime &&
          other.startTime < b.endTime,
      )
    )
      throw new AppError(409, "BREAK_OVERLAP", "Deux récréations se chevauchent.");
  const entries = await prisma.timetableEntry.findMany({ where: { timetable: { academicYearId: year.id } } });
  if (
    input.breaks.some((b) =>
      entries.some((e) => b.days.includes(e.dayOfWeek) && b.startTime < e.endTime && e.startTime < b.endTime),
    )
  )
    throw new AppError(
      409,
      "BREAK_LESSON_OVERLAP",
      "Une récréation chevauche un cours existant. Modifiez le créneau concerné.",
    );
  const tenantId = requireCurrentTenantId();
  const key = `timetable.breaks.${year.id}`;
  await prisma.tenantSetting.upsert({
    where: { tenantId_key: { tenantId, key } },
    create: { tenantId, key, value: input, updatedById: userId },
    update: { value: input, updatedById: userId },
  });
  return input.breaks;
}
