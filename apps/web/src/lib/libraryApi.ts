import { apiRequest, type TenantCredentials } from "./apiClient.js";

export type BookStatus = "AVAILABLE" | "ARCHIVED";

export interface Book {
  id: string;
  isbn: string | null;
  title: string;
  author: string;
  category: string | null;
  totalCopies: number;
  status: BookStatus;
  deletedAt: string | null;
}

export function listBooks(
  query: { category?: string; search?: string },
  creds: TenantCredentials,
): Promise<Book[]> {
  const params = new URLSearchParams();
  if (query.category) params.set("category", query.category);
  if (query.search) params.set("search", query.search);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/library/books${suffix}`, { ...creds });
}

export function createBook(
  input: { isbn?: string; title: string; author: string; category?: string; totalCopies?: number },
  creds: TenantCredentials,
): Promise<Book> {
  return apiRequest("/library/books", { method: "POST", body: input, ...creds });
}

export function archiveBook(id: string, creds: TenantCredentials): Promise<Book> {
  return apiRequest(`/library/books/${id}`, { method: "DELETE", ...creds });
}

export type LoanStatus = "ACTIVE" | "RETURNED" | "LOST";

export interface Loan {
  id: string;
  bookId: string;
  studentId: string;
  issuedByEmployeeId: string | null;
  borrowedAt: string;
  dueAt: string;
  returnedAt: string | null;
  status: LoanStatus;
}

export function listLoans(
  query: { bookId?: string; studentId?: string; status?: LoanStatus },
  creds: TenantCredentials,
): Promise<Loan[]> {
  const params = new URLSearchParams();
  if (query.bookId) params.set("bookId", query.bookId);
  if (query.studentId) params.set("studentId", query.studentId);
  if (query.status) params.set("status", query.status);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/library/loans${suffix}`, { ...creds });
}

export function createLoan(
  bookId: string,
  input: { studentId: string; dueAt: string },
  creds: TenantCredentials,
): Promise<Loan> {
  return apiRequest(`/library/books/${bookId}/loans`, { method: "POST", body: input, ...creds });
}

export function returnLoan(id: string, creds: TenantCredentials): Promise<Loan> {
  return apiRequest(`/library/loans/${id}/return`, { method: "POST", ...creds });
}

export function markLoanLost(id: string, creds: TenantCredentials): Promise<Loan> {
  return apiRequest(`/library/loans/${id}/lost`, { method: "POST", ...creds });
}
