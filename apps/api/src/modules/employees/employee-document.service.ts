import type { EmployeeDocument } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { CreateEmployeeDocumentInput } from "./employee-document.validation.js";
import { getEmployee } from "./employee.service.js";

/** Même forme que students/document.service.ts : métadonnées seulement, le fichier
 * est déjà téléversé ailleurs (URL fournie par l'appelant). */
export async function addEmployeeDocument(
  employeeId: string,
  uploadedByUserId: string,
  input: CreateEmployeeDocumentInput,
): Promise<EmployeeDocument> {
  await getEmployee(employeeId);

  return prisma.employeeDocument.create({
    data: {
      tenantId: requireCurrentTenantId(),
      employeeId,
      category: input.category,
      fileUrl: input.fileUrl,
      uploadedByUserId,
    },
  });
}

export async function listEmployeeDocuments(employeeId: string): Promise<EmployeeDocument[]> {
  await getEmployee(employeeId);
  return prisma.employeeDocument.findMany({
    where: { employeeId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

async function requireEmployeeDocument(employeeId: string, id: string): Promise<EmployeeDocument> {
  const document = await prisma.employeeDocument.findUnique({ where: { id } });
  if (!document || document.deletedAt || document.employeeId !== employeeId) {
    throw new AppError(404, "EMPLOYEE_DOCUMENT_NOT_FOUND", `Document not found: ${id}`);
  }
  return document;
}

export async function removeEmployeeDocument(employeeId: string, id: string): Promise<void> {
  await requireEmployeeDocument(employeeId, id);
  await prisma.employeeDocument.update({ where: { id }, data: { deletedAt: new Date() } });
}
