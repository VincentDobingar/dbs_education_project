import { z } from "zod";

const invoiceItemSchema = z
  .object({
    feeStructureId: z.string().min(1).optional(),
    description: z.string().min(1),
    amountCents: z.number().int().positive(),
    discountCents: z.number().int().nonnegative().optional().default(0),
  })
  .refine((data) => data.discountCents <= data.amountCents, {
    message: "discountCents cannot exceed amountCents",
    path: ["discountCents"],
  });

export const createStudentInvoiceSchema = z.object({
  studentId: z.string().min(1),
  academicYearId: z.string().min(1),
  dueAt: z.coerce.date().optional(),
  items: z.array(invoiceItemSchema).min(1),
});
export type CreateStudentInvoiceInput = z.infer<typeof createStudentInvoiceSchema>;

const INVOICE_STATUSES = ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"] as const;

export const listStudentInvoicesQuerySchema = z.object({
  studentId: z.string().min(1).optional(),
  academicYearId: z.string().min(1).optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
});
export type ListStudentInvoicesQuery = z.infer<typeof listStudentInvoicesQuerySchema>;
