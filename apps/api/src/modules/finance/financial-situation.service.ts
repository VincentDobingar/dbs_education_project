import type { StudentInvoice } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";
import { requireStudentRecord } from "../students/student.service.js";

export interface StudentFinancialSituation {
  studentId: string;
  invoices: StudentInvoice[];
  totalInvoicedCents: number;
  totalPaidCents: number;
  outstandingCents: number;
  overdueInvoices: StudentInvoice[];
}

const UNPAID_STATUSES = new Set(["ISSUED", "PARTIALLY_PAID"]);

/**
 * §23 : situation financière consolidée + impayés. `OVERDUE` reste un statut jamais
 * assigné (aucun job planifié) — les impayés sont dérivés à la volée (statut non
 * soldé + échéance dépassée) plutôt que de dépendre d'une valeur d'enum non pilotée.
 */
export async function getStudentFinancialSituation(studentId: string): Promise<StudentFinancialSituation> {
  await requireStudentRecord(studentId);

  const invoices = await prisma.studentInvoice.findMany({
    where: { studentId, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  const activeInvoices = invoices.filter((invoice) => invoice.status !== "CANCELLED");
  const totalInvoicedCents = activeInvoices.reduce((sum, invoice) => sum + invoice.totalCents, 0);
  const totalPaidCents = activeInvoices.reduce((sum, invoice) => sum + invoice.paidCents, 0);
  const overdueInvoices = invoices.filter(
    (invoice) => UNPAID_STATUSES.has(invoice.status) && invoice.dueAt !== null && invoice.dueAt < now,
  );

  return {
    studentId,
    invoices,
    totalInvoicedCents,
    totalPaidCents,
    outstandingCents: totalInvoicedCents - totalPaidCents,
    overdueInvoices,
  };
}
