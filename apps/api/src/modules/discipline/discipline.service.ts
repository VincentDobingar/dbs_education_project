import type { DisciplinaryIncident } from "@prisma/client";

import { resolveActingEmployeeId } from "../../lib/acting-employee.js";
import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";
import { notifyParentsOfStudent } from "../communication/notification.service.js";
import { requireStudentRecord } from "../students/student.service.js";

import type {
  CreateIncidentInput,
  ListIncidentsQuery,
  UpdateIncidentInput,
} from "./discipline.validation.js";

export async function createIncident(
  input: CreateIncidentInput,
  actingUserId: string,
): Promise<DisciplinaryIncident> {
  await requireStudentRecord(input.studentId);
  const reportedByEmployeeId = await resolveActingEmployeeId(actingUserId);

  const incident = await prisma.disciplinaryIncident.create({
    data: {
      tenantId: requireCurrentTenantId(),
      studentId: input.studentId,
      occurredAt: input.occurredAt,
      description: input.description,
      severity: input.severity,
      ...(input.sanction ? { sanction: input.sanction } : {}),
      ...(input.correctiveAction ? { correctiveAction: input.correctiveAction } : {}),
      ...(reportedByEmployeeId ? { reportedByEmployeeId } : {}),
    },
  });

  await notifyParentsOfStudent({
    studentId: input.studentId,
    type: "discipline.incident",
    title: "Incident disciplinaire",
    body: `Un incident disciplinaire (${input.severity}) a été enregistré.`,
  });

  return incident;
}

export async function listIncidents(query: ListIncidentsQuery): Promise<DisciplinaryIncident[]> {
  return prisma.disciplinaryIncident.findMany({
    where: {
      deletedAt: null,
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
    },
    orderBy: { occurredAt: "desc" },
  });
}

async function requireIncident(id: string): Promise<DisciplinaryIncident> {
  const incident = await prisma.disciplinaryIncident.findUnique({ where: { id } });
  if (!incident || incident.deletedAt) {
    throw new AppError(404, "INCIDENT_NOT_FOUND", `Disciplinary incident not found: ${id}`);
  }
  return incident;
}

export async function updateIncident(id: string, input: UpdateIncidentInput): Promise<DisciplinaryIncident> {
  await requireIncident(id);

  return prisma.disciplinaryIncident.update({
    where: { id },
    data: {
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.severity !== undefined ? { severity: input.severity } : {}),
      ...(input.sanction !== undefined ? { sanction: input.sanction } : {}),
      ...(input.correctiveAction !== undefined ? { correctiveAction: input.correctiveAction } : {}),
    },
  });
}

export async function removeIncident(id: string): Promise<void> {
  await requireIncident(id);
  await prisma.disciplinaryIncident.update({ where: { id }, data: { deletedAt: new Date() } });
}

/** §22 : historique disciplinaire — every non-deleted incident for a student, most recent first. */
export async function getStudentDisciplineHistory(studentId: string): Promise<DisciplinaryIncident[]> {
  await requireStudentRecord(studentId);
  return prisma.disciplinaryIncident.findMany({
    where: { studentId, deletedAt: null },
    orderBy: { occurredAt: "desc" },
  });
}
