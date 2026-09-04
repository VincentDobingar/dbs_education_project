import { apiRequest, ApiError, type TenantCredentials } from "./apiClient.js";

const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:4000/api/v1";

// Not JSON — a raw fetch reusing the same auth/tenant headers as apiRequest,
// returning bytes for the caller to open/download (PDF/CSV exports).
async function fetchBlob(path: string, creds: TenantCredentials): Promise<Blob> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "X-Tenant-Slug": creds.subdomain,
    },
  });
  if (!response.ok) {
    throw new ApiError(response.status, "FILE_FETCH_FAILED", "Could not load the file");
  }
  return response.blob();
}

export interface FeeCategory {
  id: string;
  code: string;
  nameFr: string;
  nameEn: string;
}

export interface CreateFeeCategoryInput {
  code: string;
  nameFr: string;
  nameEn: string;
}

export function listFeeCategories(creds: TenantCredentials): Promise<FeeCategory[]> {
  return apiRequest("/finance/fee-categories", { ...creds });
}

export function createFeeCategory(
  input: CreateFeeCategoryInput,
  creds: TenantCredentials,
): Promise<FeeCategory> {
  return apiRequest("/finance/fee-categories", { method: "POST", body: input, ...creds });
}

export interface FeeStructure {
  id: string;
  academicYearId: string;
  gradeLevelId: string | null;
  feeCategoryId: string;
  amountCents: number;
  dueDate: string | null;
  isMandatory: boolean;
}

export interface CreateFeeStructureInput {
  academicYearId: string;
  gradeLevelId?: string;
  feeCategoryId: string;
  amountCents: number;
  dueDate?: string;
  isMandatory?: boolean;
}

export function listFeeStructures(
  creds: TenantCredentials,
  query: { academicYearId?: string; gradeLevelId?: string; feeCategoryId?: string } = {},
): Promise<FeeStructure[]> {
  const params = new URLSearchParams();
  if (query.academicYearId) params.set("academicYearId", query.academicYearId);
  if (query.gradeLevelId) params.set("gradeLevelId", query.gradeLevelId);
  if (query.feeCategoryId) params.set("feeCategoryId", query.feeCategoryId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/finance/fee-structures${suffix}`, { ...creds });
}

export function createFeeStructure(
  input: CreateFeeStructureInput,
  creds: TenantCredentials,
): Promise<FeeStructure> {
  return apiRequest("/finance/fee-structures", { method: "POST", body: input, ...creds });
}

export type StudentInvoiceStatus = "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";

export interface StudentInvoiceItem {
  id: string;
  invoiceId: string;
  feeStructureId: string | null;
  description: string;
  amountCents: number;
  discountCents: number;
}

export interface StudentInvoice {
  id: string;
  studentId: string;
  academicYearId: string;
  number: string;
  status: StudentInvoiceStatus;
  totalCents: number;
  paidCents: number;
  dueAt: string | null;
  issuedAt: string | null;
  items: StudentInvoiceItem[];
}

export interface CreateStudentInvoiceItemInput {
  feeStructureId?: string;
  description: string;
  amountCents: number;
  discountCents?: number;
}

export interface CreateStudentInvoiceInput {
  studentId: string;
  academicYearId: string;
  dueAt?: string;
  items: CreateStudentInvoiceItemInput[];
}

export function createStudentInvoice(
  input: CreateStudentInvoiceInput,
  creds: TenantCredentials,
): Promise<StudentInvoice> {
  return apiRequest("/finance/student-invoices", { method: "POST", body: input, ...creds });
}

export function listStudentInvoices(
  creds: TenantCredentials,
  query: { studentId?: string; academicYearId?: string; status?: StudentInvoiceStatus } = {},
): Promise<StudentInvoice[]> {
  const params = new URLSearchParams();
  if (query.studentId) params.set("studentId", query.studentId);
  if (query.academicYearId) params.set("academicYearId", query.academicYearId);
  if (query.status) params.set("status", query.status);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/finance/student-invoices${suffix}`, { ...creds });
}

export function issueStudentInvoice(id: string, creds: TenantCredentials): Promise<StudentInvoice> {
  return apiRequest(`/finance/student-invoices/${id}/issue`, { method: "POST", ...creds });
}

export function cancelStudentInvoice(id: string, creds: TenantCredentials): Promise<StudentInvoice> {
  return apiRequest(`/finance/student-invoices/${id}/cancel`, { method: "POST", ...creds });
}

export interface StudentFinancialSituation {
  studentId: string;
  invoices: StudentInvoice[];
  totalInvoicedCents: number;
  totalPaidCents: number;
  outstandingCents: number;
  overdueInvoices: StudentInvoice[];
}

export function getStudentFinancialSituation(
  studentId: string,
  creds: TenantCredentials,
): Promise<StudentFinancialSituation> {
  return apiRequest(`/finance/students/${studentId}/financial-situation`, { ...creds });
}

export interface StudentReceipt {
  id: string;
  studentPaymentId: string;
  number: string;
  issuedAt: string;
  pdfUrl: string | null;
}

export interface StudentPayment {
  id: string;
  studentInvoiceId: string;
  amountCents: number;
  method: string;
  recordedByEmployeeId: string | null;
  paidAt: string;
  receipt: StudentReceipt | null;
}

export function recordCashPayment(
  invoiceId: string,
  amountCents: number,
  creds: TenantCredentials,
): Promise<StudentPayment> {
  return apiRequest(`/finance/student-invoices/${invoiceId}/payments`, {
    method: "POST",
    body: { amountCents },
    ...creds,
  });
}

export function listPaymentsForInvoice(
  invoiceId: string,
  creds: TenantCredentials,
): Promise<StudentPayment[]> {
  return apiRequest(`/finance/student-invoices/${invoiceId}/payments`, { ...creds });
}

export function fetchReceiptPdf(receiptId: string, creds: TenantCredentials): Promise<Blob> {
  return fetchBlob(`/finance/receipts/${receiptId}/pdf`, creds);
}

export interface StudentPaymentRefund {
  id: string;
  studentPaymentId: string;
  amountCents: number;
  reason: string;
  refundedAt: string;
}

export function refundStudentPayment(
  paymentId: string,
  input: { amountCents: number; reason: string },
  creds: TenantCredentials,
): Promise<StudentPaymentRefund> {
  return apiRequest(`/finance/payments/${paymentId}/refunds`, { method: "POST", body: input, ...creds });
}

export function listRefundsForPayment(
  paymentId: string,
  creds: TenantCredentials,
): Promise<StudentPaymentRefund[]> {
  return apiRequest(`/finance/payments/${paymentId}/refunds`, { ...creds });
}

export interface ExpenseCategory {
  id: string;
  code: string;
  nameFr: string;
  nameEn: string;
}

export interface CreateExpenseCategoryInput {
  code: string;
  nameFr: string;
  nameEn: string;
}

export function listExpenseCategories(creds: TenantCredentials): Promise<ExpenseCategory[]> {
  return apiRequest("/finance/expense-categories", { ...creds });
}

export function createExpenseCategory(
  input: CreateExpenseCategoryInput,
  creds: TenantCredentials,
): Promise<ExpenseCategory> {
  return apiRequest("/finance/expense-categories", { method: "POST", body: input, ...creds });
}

export interface Expense {
  id: string;
  categoryId: string;
  supplierName: string | null;
  description: string;
  amountCents: number;
  expenseDate: string;
}

export interface CreateExpenseInput {
  categoryId: string;
  supplierName?: string;
  description: string;
  amountCents: number;
  expenseDate: string;
}

export function listExpenses(
  creds: TenantCredentials,
  query: { categoryId?: string; startDate?: string; endDate?: string } = {},
): Promise<Expense[]> {
  const params = new URLSearchParams();
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (query.startDate) params.set("startDate", query.startDate);
  if (query.endDate) params.set("endDate", query.endDate);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/finance/expenses${suffix}`, { ...creds });
}

export function createExpense(input: CreateExpenseInput, creds: TenantCredentials): Promise<Expense> {
  return apiRequest("/finance/expenses", { method: "POST", body: input, ...creds });
}

export function removeExpense(id: string, creds: TenantCredentials): Promise<void> {
  return apiRequest(`/finance/expenses/${id}`, { method: "DELETE", ...creds });
}

export type CashSessionStatus = "OPEN" | "CLOSED";

export interface CashSession {
  id: string;
  campusId: string | null;
  openedByEmployeeId: string;
  openedAt: string;
  closedByEmployeeId: string | null;
  closedAt: string | null;
  openingBalanceCents: number;
  closingBalanceCents: number | null;
  status: CashSessionStatus;
}

export function openCashSession(
  input: { campusId?: string; openingBalanceCents: number },
  creds: TenantCredentials,
): Promise<CashSession> {
  return apiRequest("/finance/cash-sessions/open", { method: "POST", body: input, ...creds });
}

export function closeCashSession(
  id: string,
  closingBalanceCents: number,
  creds: TenantCredentials,
): Promise<CashSession> {
  return apiRequest(`/finance/cash-sessions/${id}/close`, {
    method: "POST",
    body: { closingBalanceCents },
    ...creds,
  });
}

export function listCashSessions(
  creds: TenantCredentials,
  query: { campusId?: string; status?: CashSessionStatus } = {},
): Promise<CashSession[]> {
  const params = new URLSearchParams();
  if (query.campusId) params.set("campusId", query.campusId);
  if (query.status) params.set("status", query.status);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/finance/cash-sessions${suffix}`, { ...creds });
}

export interface FinancialReportBreakdown {
  key: string;
  label: string;
  amountCents: number;
}

export interface RevenueReport {
  startDate: string;
  endDate: string;
  paymentCount: number;
  grossRevenueCents: number;
  refundedCents: number;
  netRevenueCents: number;
  byMethod: FinancialReportBreakdown[];
  byDay: FinancialReportBreakdown[];
}

export interface ExpenseReport {
  startDate: string;
  endDate: string;
  expenseCount: number;
  totalExpensesCents: number;
  byCategory: FinancialReportBreakdown[];
  byDay: FinancialReportBreakdown[];
}

function reportQuery(range: { startDate: string; endDate: string }): string {
  const params = new URLSearchParams({ startDate: range.startDate, endDate: range.endDate });
  return `?${params.toString()}`;
}

export function getRevenueReport(
  range: { startDate: string; endDate: string },
  creds: TenantCredentials,
): Promise<RevenueReport> {
  return apiRequest(`/finance/reports/revenue${reportQuery(range)}`, { ...creds });
}

export function fetchRevenueReportCsv(
  range: { startDate: string; endDate: string },
  creds: TenantCredentials,
): Promise<Blob> {
  return fetchBlob(`/finance/reports/revenue/csv${reportQuery(range)}`, creds);
}

export function fetchRevenueReportPdf(
  range: { startDate: string; endDate: string },
  creds: TenantCredentials,
): Promise<Blob> {
  return fetchBlob(`/finance/reports/revenue/pdf${reportQuery(range)}`, creds);
}

export function getExpenseReport(
  range: { startDate: string; endDate: string },
  creds: TenantCredentials,
): Promise<ExpenseReport> {
  return apiRequest(`/finance/reports/expenses${reportQuery(range)}`, { ...creds });
}

export function fetchExpenseReportCsv(
  range: { startDate: string; endDate: string },
  creds: TenantCredentials,
): Promise<Blob> {
  return fetchBlob(`/finance/reports/expenses/csv${reportQuery(range)}`, creds);
}

export function fetchExpenseReportPdf(
  range: { startDate: string; endDate: string },
  creds: TenantCredentials,
): Promise<Blob> {
  return fetchBlob(`/finance/reports/expenses/pdf${reportQuery(range)}`, creds);
}
