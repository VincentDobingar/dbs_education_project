import type { StudentInvoice, StudentInvoiceItem } from "@prisma/client";

import { AppError } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { requireCurrentTenantId } from "../../lib/tenant-context.js";
import { generateReference } from "../payments/reference.js";
import { requireStudentRecord } from "../students/student.service.js";

import type { CreateStudentInvoiceInput, ListStudentInvoicesQuery } from "./student-invoice.validation.js";

export type StudentInvoiceWithItems = StudentInvoice & { items: StudentInvoiceItem[] };

export async function createStudentInvoice(
  input: CreateStudentInvoiceInput,
): Promise<StudentInvoiceWithItems> {
  await requireStudentRecord(input.studentId);
  const academicYear = await prisma.academicYear.findUnique({ where: { id: input.academicYearId } });
  if (!academicYear) {
    throw new AppError(404, "ACADEMIC_YEAR_NOT_FOUND", `Academic year not found: ${input.academicYearId}`);
  }

  const feeStructureIds = input.items
    .map((item) => item.feeStructureId)
    .filter((id): id is string => id !== undefined);
  if (feeStructureIds.length > 0) {
    const found = await prisma.feeStructure.findMany({ where: { id: { in: feeStructureIds } } });
    const foundIds = new Set(found.map((f) => f.id));
    const missing = feeStructureIds.find((id) => !foundIds.has(id));
    if (missing) {
      throw new AppError(404, "FEE_STRUCTURE_NOT_FOUND", `Fee structure not found: ${missing}`);
    }
  }

  // Integer cents throughout (§23, §40) — never floating-point money math.
  const totalCents = input.items.reduce((sum, item) => sum + (item.amountCents - item.discountCents), 0);

  return prisma.studentInvoice.create({
    data: {
      tenantId: requireCurrentTenantId(),
      studentId: input.studentId,
      academicYearId: input.academicYearId,
      number: generateReference("INV"),
      totalCents,
      ...(input.dueAt !== undefined ? { dueAt: input.dueAt } : {}),
      items: {
        create: input.items.map((item) => ({
          description: item.description,
          amountCents: item.amountCents,
          discountCents: item.discountCents,
          ...(item.feeStructureId ? { feeStructureId: item.feeStructureId } : {}),
        })),
      },
    },
    include: { items: true },
  });
}

export async function listStudentInvoices(query: ListStudentInvoicesQuery): Promise<StudentInvoice[]> {
  return prisma.studentInvoice.findMany({
    where: {
      deletedAt: null,
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
      ...(query.status ? { status: query.status } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function requireStudentInvoice(id: string): Promise<StudentInvoiceWithItems> {
  const invoice = await prisma.studentInvoice.findUnique({ where: { id }, include: { items: true } });
  if (!invoice || invoice.deletedAt) {
    throw new AppError(404, "INVOICE_NOT_FOUND", `Student invoice not found: ${id}`);
  }
  return invoice;
}

export async function issueStudentInvoice(id: string): Promise<StudentInvoice> {
  const invoice = await requireStudentInvoice(id);
  if (invoice.status !== "DRAFT") {
    throw new AppError(409, "INVOICE_NOT_DRAFT", "Only a DRAFT invoice can be issued");
  }

  return prisma.studentInvoice.update({
    where: { id },
    data: { status: "ISSUED", issuedAt: new Date() },
  });
}

/**
 * "Annulation contrôlée" (§23) : only a not-yet-paid invoice can be cancelled directly.
 * An invoice with any payment recorded must be refunded first (out of scope for this
 * slice — payment recording and refunds land in the next one).
 */
export async function cancelStudentInvoice(id: string): Promise<StudentInvoice> {
  const invoice = await requireStudentInvoice(id);
  if (invoice.status === "CANCELLED") {
    throw new AppError(409, "INVOICE_ALREADY_CANCELLED", "Invoice is already cancelled");
  }
  if (invoice.status === "PAID" || invoice.status === "PARTIALLY_PAID" || invoice.paidCents > 0) {
    throw new AppError(
      409,
      "INVOICE_HAS_PAYMENTS",
      "Cannot cancel an invoice with recorded payments — refund the payments first",
    );
  }

  return prisma.studentInvoice.update({ where: { id }, data: { status: "CANCELLED" } });
}
