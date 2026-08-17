import { z } from "zod";

export const createBookSchema = z.object({
  isbn: z.string().min(1).optional(),
  title: z.string().min(1),
  author: z.string().min(1),
  category: z.string().min(1).optional(),
  totalCopies: z.number().int().positive().default(1),
});
export type CreateBookInput = z.infer<typeof createBookSchema>;

export const updateBookSchema = z.object({
  isbn: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  author: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  totalCopies: z.number().int().positive().optional(),
});
export type UpdateBookInput = z.infer<typeof updateBookSchema>;

export const listBooksQuerySchema = z.object({
  category: z.string().min(1).optional(),
  search: z.string().min(1).optional(),
});
export type ListBooksQuery = z.infer<typeof listBooksQuerySchema>;

export const createLoanSchema = z.object({
  studentId: z.string().min(1),
  dueAt: z.coerce.date(),
});
export type CreateLoanInput = z.infer<typeof createLoanSchema>;

export const listLoansQuerySchema = z.object({
  bookId: z.string().min(1).optional(),
  studentId: z.string().min(1).optional(),
  status: z.enum(["ACTIVE", "RETURNED", "LOST"]).optional(),
});
export type ListLoansQuery = z.infer<typeof listLoansQuerySchema>;
