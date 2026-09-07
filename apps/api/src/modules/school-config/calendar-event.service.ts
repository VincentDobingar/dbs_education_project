import type { CalendarEvent } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type {
  CreateCalendarEventInput,
  ListCalendarEventsQuery,
  UpdateCalendarEventInput,
} from "./calendar-event.validation.js";

async function requireAcademicYearExists(academicYearId: string): Promise<void> {
  const academicYear = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
  if (!academicYear || academicYear.deletedAt) {
    throw new AppError(404, "ACADEMIC_YEAR_NOT_FOUND", `Academic year not found: ${academicYearId}`);
  }
}

export async function createCalendarEvent(input: CreateCalendarEventInput): Promise<CalendarEvent> {
  if (input.academicYearId) {
    await requireAcademicYearExists(input.academicYearId);
  }

  return prisma.calendarEvent.create({
    data: {
      tenantId: requireCurrentTenantId(),
      type: input.type,
      title: input.title,
      startDate: input.startDate,
      ...(input.academicYearId ? { academicYearId: input.academicYearId } : {}),
      ...(input.endDate ? { endDate: input.endDate } : {}),
      ...(input.description ? { description: input.description } : {}),
    },
  });
}

/**
 * §20 : "calendrier/jours fériés" — startDate/endDate en filtre renvoient tout
 * événement qui *chevauche* la fenêtre demandée (un jour férié de trois jours qui
 * commence avant la fenêtre mais empiète dessus doit apparaître), pas seulement
 * ceux qui commencent dedans — même raisonnement que timeRangesOverlap en
 * emplois du temps, appliqué à des dates plutôt qu'à des heures.
 */
export async function listCalendarEvents(query: ListCalendarEventsQuery): Promise<CalendarEvent[]> {
  return prisma.calendarEvent.findMany({
    where: {
      deletedAt: null,
      ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.endDate ? { startDate: { lte: query.endDate } } : {}),
      ...(query.startDate
        ? {
            OR: [
              { endDate: { gte: query.startDate } },
              { endDate: null, startDate: { gte: query.startDate } },
            ],
          }
        : {}),
    },
    orderBy: { startDate: "asc" },
  });
}

export async function requireCalendarEvent(id: string): Promise<CalendarEvent> {
  const event = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!event || event.deletedAt) {
    throw new AppError(404, "CALENDAR_EVENT_NOT_FOUND", `Calendar event not found: ${id}`);
  }
  return event;
}

export async function updateCalendarEvent(
  id: string,
  input: UpdateCalendarEventInput,
): Promise<CalendarEvent> {
  const event = await requireCalendarEvent(id);

  const nextStartDate = input.startDate ?? event.startDate;
  const nextEndDate = input.endDate !== undefined ? input.endDate : event.endDate;
  if (nextEndDate && nextEndDate < nextStartDate) {
    throw new AppError(400, "INVALID_DATE_RANGE", "endDate must be on or after startDate");
  }

  return prisma.calendarEvent.update({
    where: { id },
    data: {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    },
  });
}

export async function removeCalendarEvent(id: string): Promise<void> {
  await requireCalendarEvent(id);
  await prisma.calendarEvent.update({ where: { id }, data: { deletedAt: new Date() } });
}
