import type { PerformanceEvaluation } from "@prisma/client";

import { resolveActingEmployeeId } from "../../lib/acting-employee.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import { getEmployee } from "./employee.service.js";
import type { CreatePerformanceEvaluationInput } from "./performance-evaluation.validation.js";

/** Pas d'échelle imposée (§27 n'en fixe aucune) : `score` reste un entier libre,
 * l'établissement choisit sa propre convention (note /20, /5, pourcentage...). */
export async function createPerformanceEvaluation(
  employeeId: string,
  input: CreatePerformanceEvaluationInput,
  actingUserId: string,
): Promise<PerformanceEvaluation> {
  await getEmployee(employeeId);
  const evaluatedByEmployeeId = await resolveActingEmployeeId(actingUserId);

  return prisma.performanceEvaluation.create({
    data: {
      tenantId: requireCurrentTenantId(),
      employeeId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      ...(evaluatedByEmployeeId ? { evaluatedByEmployeeId } : {}),
      ...(input.score !== undefined ? { score: input.score } : {}),
      ...(input.comments !== undefined ? { comments: input.comments } : {}),
    },
  });
}

export async function listPerformanceEvaluations(employeeId: string): Promise<PerformanceEvaluation[]> {
  await getEmployee(employeeId);
  return prisma.performanceEvaluation.findMany({
    where: { employeeId },
    orderBy: { periodStart: "desc" },
  });
}
