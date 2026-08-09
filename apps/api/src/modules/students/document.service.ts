import type { StudentDocument } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";

import type { CreateStudentDocumentInput } from "./document.validation.js";
import { requireStudentRecord } from "./student.service.js";

/**
 * Stores metadata only (category + a URL the client already uploaded the file to,
 * e.g. via a pre-signed upload elsewhere) — this API never handles file bytes.
 */
export async function addStudentDocument(
  studentId: string,
  uploadedByUserId: string,
  input: CreateStudentDocumentInput,
): Promise<StudentDocument> {
  await requireStudentRecord(studentId);

  return prisma.studentDocument.create({
    data: {
      tenantId: requireCurrentTenantId(),
      studentId,
      category: input.category,
      fileUrl: input.fileUrl,
      uploadedByUserId,
    },
  });
}

export async function listStudentDocuments(studentId: string): Promise<StudentDocument[]> {
  await requireStudentRecord(studentId);
  return prisma.studentDocument.findMany({
    where: { studentId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

async function requireStudentDocument(studentId: string, id: string): Promise<StudentDocument> {
  const document = await prisma.studentDocument.findUnique({ where: { id } });
  if (!document || document.deletedAt || document.studentId !== studentId) {
    throw new AppError(404, "STUDENT_DOCUMENT_NOT_FOUND", `Document not found: ${id}`);
  }
  return document;
}

export async function removeStudentDocument(studentId: string, id: string): Promise<void> {
  await requireStudentDocument(studentId, id);
  await prisma.studentDocument.update({ where: { id }, data: { deletedAt: new Date() } });
}
