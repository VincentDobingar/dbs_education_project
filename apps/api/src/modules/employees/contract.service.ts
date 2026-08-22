import type { EmploymentContract } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { CreateContractInput, UpdateContractInput } from "./contract.validation.js";
import { getEmployee } from "./employee.service.js";

/**
 * Contrats et données salariales (§27) : gardé côté route par `hr.salary.manage`,
 * une permission distincte de `hr.manage` — « les informations salariales doivent
 * avoir des permissions particulièrement restrictives » (§27), donc jamais couplées
 * à la gestion générale du personnel (fiche, présences, congés).
 */
export async function createContract(
  employeeId: string,
  input: CreateContractInput,
): Promise<EmploymentContract> {
  await getEmployee(employeeId);

  return prisma.employmentContract.create({
    data: {
      tenantId: requireCurrentTenantId(),
      employeeId,
      contractType: input.contractType,
      startDate: input.startDate,
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      ...(input.salaryCents !== undefined ? { salaryCents: input.salaryCents } : {}),
      ...(input.fileUrl !== undefined ? { fileUrl: input.fileUrl } : {}),
    },
  });
}

/** Ordonné du plus ancien au plus récent — sert aussi d'historique professionnel
 * (contrats successifs, renouvellements, changements de type) sans dupliquer cette
 * vue dans un endpoint séparé. */
export async function listContracts(employeeId: string): Promise<EmploymentContract[]> {
  await getEmployee(employeeId);
  return prisma.employmentContract.findMany({ where: { employeeId }, orderBy: { startDate: "asc" } });
}

async function requireContract(employeeId: string, id: string): Promise<EmploymentContract> {
  const contract = await prisma.employmentContract.findUnique({ where: { id } });
  if (!contract || contract.employeeId !== employeeId) {
    throw new AppError(404, "CONTRACT_NOT_FOUND", `Contract not found: ${id}`);
  }
  return contract;
}

export async function updateContract(
  employeeId: string,
  id: string,
  input: UpdateContractInput,
): Promise<EmploymentContract> {
  await requireContract(employeeId, id);

  return prisma.employmentContract.update({
    where: { id },
    data: {
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      ...(input.salaryCents !== undefined ? { salaryCents: input.salaryCents } : {}),
      ...(input.fileUrl !== undefined ? { fileUrl: input.fileUrl } : {}),
    },
  });
}
