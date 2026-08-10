import { z } from "zod";

const INCIDENT_SEVERITIES = ["MINOR", "MODERATE", "SEVERE"] as const;

export const createIncidentSchema = z.object({
  studentId: z.string().min(1),
  occurredAt: z.coerce.date(),
  description: z.string().min(1),
  severity: z.enum(INCIDENT_SEVERITIES),
  sanction: z.string().min(1).optional(),
  correctiveAction: z.string().min(1).optional(),
});
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

export const updateIncidentSchema = z.object({
  description: z.string().min(1).optional(),
  severity: z.enum(INCIDENT_SEVERITIES).optional(),
  sanction: z.string().min(1).optional(),
  correctiveAction: z.string().min(1).optional(),
});
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;

export const listIncidentsQuerySchema = z.object({
  studentId: z.string().min(1).optional(),
  severity: z.enum(INCIDENT_SEVERITIES).optional(),
});
export type ListIncidentsQuery = z.infer<typeof listIncidentsQuerySchema>;
