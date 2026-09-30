import { z } from "zod";

export const createExpenseSchema = z.object({
  categoryId: z.string().min(1),
  supplierName: z.string().min(1).optional(),
  description: z.string().min(1),
  amountCents: z.number().int().positive(),
  expenseDate: z.coerce.date(),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const updateExpenseSchema = z.object({
  categoryId: z.string().min(1).optional(),
  supplierName: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  amountCents: z.number().int().positive().optional(),
  expenseDate: z.coerce.date().optional(),
});
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;

export const listExpensesQuerySchema = z.object({
  categoryId: z.string().min(1).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  // Pagination opt-in (comme listStudentsQuerySchema) — sans `page`, comportement
  // inchangé (tout renvoyer) ; avec `page`, le contrôleur bascule vers `{ data, total }`.
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
