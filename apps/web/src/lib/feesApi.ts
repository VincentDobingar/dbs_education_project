import type { TFunction } from "i18next";

import { apiRequest, fetchBlob, type TenantCredentials } from "./apiClient.js";

export type FeeNature = "REGISTRATION" | "TUITION" | "ANNEX" | "EXAM";
export type FeeStudentType = "ALL" | "NEW" | "RETURNING";
export type FeeAnchorType = "ENROLLMENT" | "PERIOD_START" | "FIXED_DATE";
export type FeeDiscountKind = "PERCENT" | "AMOUNT";
export type InvoiceKind = "MANUAL" | "REGISTRATION" | "INSTALLMENT" | "PENALTY";

export interface FeeCategoryRow {
  id: string;
  code: string;
  nameFr: string;
  nameEn: string;
  nature: FeeNature;
  isRefundable: boolean;
}

export interface FeeStructureRow {
  id: string;
  academicYearId: string;
  gradeLevelId: string | null;
  programId: string | null;
  feeCategoryId: string;
  amountCents: number;
  isMandatory: boolean;
  studentType: FeeStudentType;
  dueWithInstallment: number | null;
  feeCategory: FeeCategoryRow;
}

export interface FeePlanInstallment {
  id?: string;
  sequence?: number;
  label: string;
  shareBps: number;
  anchorType: FeeAnchorType;
  academicPeriodId: string | null;
  offsetDays: number;
  fixedDate: string | null;
}

export interface FeePlan {
  id: string;
  academicYearId: string;
  educationCycleId: string | null;
  name: string;
  installments: FeePlanInstallment[];
}

export interface DiscountPreset {
  id: string;
  name: string;
  kind: FeeDiscountKind;
  value: number;
  isActive: boolean;
}

export interface FeePolicy {
  midYearPolicy: "GROUP" | "PRORATA";
  reenrollmentWithArrears: "ALLOW" | "BLOCK";
  withholdReportCards: boolean;
  withholdAfterDays: number;
  remindersEnabled: boolean;
  reminderDaysBefore: number;
  reminderDaysAfter: number;
  longOverdueDays: number;
  penaltyEnabled: boolean;
  penaltyKind: "AMOUNT" | "PERCENT";
  penaltyValue: number;
  penaltyAfterDays: number;
  onlinePaymentEnabled: boolean;
}

export interface PreviewDueItem {
  feeStructureId: string | null;
  label: string;
  nature: FeeNature;
  amountCents: number;
  discountCents: number;
}

export interface PreviewDue {
  kind: "REGISTRATION" | "INSTALLMENT";
  sequence: number | null;
  sequences?: number[];
  label: string;
  dueDate: string;
  totalCents: number;
  items: PreviewDueItem[];
}

export interface FeeLineChoice {
  feeStructureId: string;
  label: string;
  nature: FeeNature;
  amountCents: number;
}

export interface EnrollmentPreview {
  mode: "PLAN" | "LEGACY";
  isReturning: boolean;
  planName: string | null;
  optionalChoices: FeeLineChoice[];
  discounts: { label: string; amountCents: number }[];
  arrearsCents: number;
  dues: PreviewDue[];
  totalCents: number;
  grossCents: number;
  discountCents: number;
  registrationCents: number;
  groupedSequences: number[];
  skippedSequences: number[];
  reenrollmentBlocked: boolean;
}

export interface ManualDiscount {
  label: string;
  kind: FeeDiscountKind;
  value: number;
  reason: string;
}

export interface EnrollmentRequest {
  academicYearId: string;
  classroomId: string;
  campusId: string;
  gradeLevelId: string;
  registrationPeriodId: string;
  optionalFeeStructureIds?: string[];
  discountPresetIds?: string[];
  manualDiscounts?: ManualDiscount[];
}

export interface ScheduleInvoice {
  id: string;
  number: string;
  kind: InvoiceKind;
  installmentSequence: number | null;
  status: string;
  totalCents: number;
  paidCents: number;
  dueAt: string | null;
  academicYearId: string;
  items: { description: string; amountCents: number; discountCents: number }[];
}

export interface StudentSchedule {
  agreements: {
    id: string;
    academicYearId: string;
    totalCents: number;
    grossCents: number;
    discountCents: number;
    isReturning: boolean;
    status: string;
    feePlan: { name: string } | null;
    enrollment: { status: string };
    discounts: { id: string; label: string; amountCents: number; reason: string | null }[];
  }[];
  invoices: ScheduleInvoice[];
  creditCents: number;
  outstandingCents: number;
  overdueCents: number;
  nextDue: { invoiceId: string; dueAt: string | null; amountCents: number } | null;
}

export interface AllocationResult {
  allocationGroupId: string;
  amountCents: number;
  lines: {
    invoiceId: string;
    invoiceNumber: string;
    label: string;
    amountCents: number;
    remainingCents: number;
  }[];
  creditCreatedCents: number;
  creditUsedCents: number;
  activatedEnrollment: boolean;
}

export interface RecoveryBucket {
  key: string;
  label: string;
  billedCents: number;
  paidCents: number;
  outstandingCents: number;
  overdueCents: number;
  recoveryRate: number;
}

export interface RecoveryDashboard {
  totals: {
    billedCents: number;
    paidCents: number;
    outstandingCents: number;
    overdueCents: number;
    recoveryRate: number;
    expectedNext30DaysCents: number;
    admittedAwaitingRegistration: number;
  };
  byTranche: RecoveryBucket[];
  byClassroom: RecoveryBucket[];
  lateStudents: {
    studentId: string;
    name: string;
    matricule: string;
    classroom: string;
    overdueCents: number;
    oldestDueAt: string;
    daysLate: number;
  }[];
}

const q = (params: Record<string, string | undefined>): string => {
  const entries = Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]));
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : "";
};

// ------------------------------------------------------------ paramétrage
export const listFeeCategories = (creds: TenantCredentials): Promise<FeeCategoryRow[]> =>
  apiRequest("/finance/fee-categories", creds);
export const createFeeCategory = (
  input: { code: string; nameFr: string; nameEn: string; nature: FeeNature; isRefundable?: boolean },
  creds: TenantCredentials,
): Promise<FeeCategoryRow> =>
  apiRequest("/finance/fee-categories", { ...creds, method: "POST", body: input });
export const updateFeeCategory = (
  id: string,
  input: Partial<Pick<FeeCategoryRow, "nameFr" | "nameEn" | "nature" | "isRefundable">>,
  creds: TenantCredentials,
): Promise<FeeCategoryRow> =>
  apiRequest(`/finance/fee-categories/${id}`, { ...creds, method: "PATCH", body: input });

export const listFeeStructures = (
  academicYearId: string,
  creds: TenantCredentials,
): Promise<FeeStructureRow[]> => apiRequest(`/finance/fee-structures${q({ academicYearId })}`, creds);
export const createFeeStructure = (
  input: {
    academicYearId: string;
    feeCategoryId: string;
    amountCents: number;
    gradeLevelId?: string;
    isMandatory?: boolean;
    studentType?: FeeStudentType;
    dueWithInstallment?: number;
  },
  creds: TenantCredentials,
): Promise<FeeStructureRow> =>
  apiRequest("/finance/fee-structures", { ...creds, method: "POST", body: input });
export const deleteFeeStructure = (id: string, creds: TenantCredentials): Promise<void> =>
  apiRequest(`/finance/fee-structures/${id}`, { ...creds, method: "DELETE" });

export const listFeePlans = (academicYearId: string, creds: TenantCredentials): Promise<FeePlan[]> =>
  apiRequest(`/finance/fee-plans${q({ academicYearId })}`, creds);
export const saveFeePlan = (
  input: {
    academicYearId: string;
    educationCycleId: string | null;
    name: string;
    installments: FeePlanInstallment[];
  },
  creds: TenantCredentials,
  id?: string,
): Promise<FeePlan> =>
  apiRequest(id ? `/finance/fee-plans/${id}` : "/finance/fee-plans", {
    ...creds,
    method: id ? "PUT" : "POST",
    body: input,
  });
export const deleteFeePlan = (id: string, creds: TenantCredentials): Promise<void> =>
  apiRequest(`/finance/fee-plans/${id}`, { ...creds, method: "DELETE" });
export const copyFeeSetup = (
  input: { fromAcademicYearId: string; toAcademicYearId: string },
  creds: TenantCredentials,
): Promise<{ plans: number; feeStructures: number }> =>
  apiRequest("/finance/fee-setup/copy", { ...creds, method: "POST", body: input });

export const listDiscountPresets = (creds: TenantCredentials): Promise<DiscountPreset[]> =>
  apiRequest("/finance/discount-presets", creds);
export const createDiscountPreset = (
  input: { name: string; kind: FeeDiscountKind; value: number },
  creds: TenantCredentials,
): Promise<DiscountPreset> =>
  apiRequest("/finance/discount-presets", { ...creds, method: "POST", body: input });
export const updateDiscountPreset = (
  id: string,
  input: { isActive?: boolean; name?: string },
  creds: TenantCredentials,
): Promise<DiscountPreset> =>
  apiRequest(`/finance/discount-presets/${id}`, { ...creds, method: "PATCH", body: input });

export const getFeePolicy = (creds: TenantCredentials): Promise<FeePolicy> =>
  apiRequest("/finance/fee-policy", creds);
export const saveFeePolicy = (input: FeePolicy, creds: TenantCredentials): Promise<FeePolicy> =>
  apiRequest("/finance/fee-policy", { ...creds, method: "PUT", body: input });

// ------------------------------------------------------------ inscription
export const getFeeMode = (
  academicYearId: string,
  creds: TenantCredentials,
): Promise<{ usesPlans: boolean; plans: { id: string; name: string }[] }> =>
  apiRequest(`/registrations/fee-mode${q({ academicYearId })}`, creds);
export const listEnrollmentDiscountPresets = (creds: TenantCredentials): Promise<DiscountPreset[]> =>
  apiRequest("/registrations/discount-presets", creds);
export const previewEnrollment = (
  studentId: string,
  input: EnrollmentRequest,
  creds: TenantCredentials,
): Promise<EnrollmentPreview> =>
  apiRequest(`/students/${studentId}/enrollments/preview`, { ...creds, method: "POST", body: input });
export const createEnrollment = (
  studentId: string,
  input: EnrollmentRequest,
  creds: TenantCredentials,
): Promise<{ id: string; status: string }> =>
  apiRequest(`/students/${studentId}/enrollments`, { ...creds, method: "POST", body: input });

// ------------------------------------------------------------ caisse et suivi
export const getStudentSchedule = (studentId: string, creds: TenantCredentials): Promise<StudentSchedule> =>
  apiRequest(`/finance/students/${studentId}/schedule`, creds);
export const recordStudentPayment = (
  studentId: string,
  input: { amountCents: number; invoiceId?: string },
  creds: TenantCredentials,
): Promise<AllocationResult> =>
  apiRequest(`/finance/students/${studentId}/payments`, { ...creds, method: "POST", body: input });
export const fetchPaymentGroupPdf = (groupId: string, creds: TenantCredentials): Promise<Blob> =>
  fetchBlob(`/finance/payment-groups/${groupId}/pdf`, creds);
export const rescheduleInvoice = (
  invoiceId: string,
  input: { dueAt: string; reason: string },
  creds: TenantCredentials,
): Promise<unknown> =>
  apiRequest(`/finance/student-invoices/${invoiceId}/reschedule`, { ...creds, method: "POST", body: input });
export const splitInvoice = (
  invoiceId: string,
  input: { parts: { amountCents: number; dueAt: string }[]; reason: string },
  creds: TenantCredentials,
): Promise<unknown> =>
  apiRequest(`/finance/student-invoices/${invoiceId}/split`, { ...creds, method: "POST", body: input });
export const getRecovery = (academicYearId: string, creds: TenantCredentials): Promise<RecoveryDashboard> =>
  apiRequest(`/finance/recovery${q({ academicYearId })}`, creds);

// ------------------------------------------------------------ portail parent
export interface FamilySchedule {
  schoolName: string;
  currency: string;
  dues: {
    id: string;
    number: string;
    label: string;
    kind: InvoiceKind;
    dueAt: string | null;
    totalCents: number;
    paidCents: number;
    outstandingCents: number;
    status: string;
    isOverdue: boolean;
    items: { description: string; amountCents: number }[];
  }[];
  outstandingCents: number;
  overdueCents: number;
  creditCents: number;
  nextDue: { id: string; label: string; dueAt: string | null; amountCents: number } | null;
  reportCardWithheld: boolean;
  onlinePaymentEnabled: boolean;
}

export const getFamilySchedule = (studentId: string, accessToken: string): Promise<FamilySchedule> =>
  apiRequest(`/parent-portal/children/${studentId}/fee-schedule`, { accessToken, authContext: "portal" });
export const getFamilyPaymentOptions = (
  studentId: string,
  invoiceId: string,
  accessToken: string,
): Promise<{
  providers: { code: string; nameFr: string; nameEn: string; isTestMode: boolean }[];
  amountCents: number;
  cash: { schoolName: string; reference: string };
}> =>
  apiRequest(`/parent-portal/children/${studentId}/fee-schedule/${invoiceId}/payment-options`, {
    accessToken,
    authContext: "portal",
  });
export const payFamilyInvoice = (
  studentId: string,
  invoiceId: string,
  input: { providerCode: string; phone: string },
  accessToken: string,
): Promise<{ paymentIntentId: string; customerMessage: string | null }> =>
  apiRequest(`/parent-portal/children/${studentId}/fee-schedule/${invoiceId}/pay`, {
    accessToken,
    authContext: "portal",
    method: "POST",
    body: input,
  });
export const getFamilyPaymentStatus = (
  studentId: string,
  invoiceId: string,
  intentId: string,
  accessToken: string,
): Promise<{ paymentStatus: string; invoiceStatus: string }> =>
  apiRequest(`/parent-portal/children/${studentId}/fee-schedule/${invoiceId}/payments/${intentId}`, {
    accessToken,
    authContext: "portal",
  });

// ------------------------------------------------------------ SuperAdmin
export interface FeeSettlementRow {
  tenantId: string;
  tenantName: string;
  currency: string;
  pendingCents: number;
  pendingPayments: number;
  settledCents: number;
}
export const listFeeSettlements = (accessToken: string): Promise<FeeSettlementRow[]> =>
  apiRequest("/platform/fee-settlements", { accessToken, authContext: "admin" });
export const markFeeSettlementPaid = (
  tenantId: string,
  input: { reference: string; justification: string },
  accessToken: string,
): Promise<{ count: number; amountCents: number }> =>
  apiRequest(`/platform/fee-settlements/${tenantId}/mark-paid`, {
    accessToken,
    authContext: "admin",
    method: "POST",
    body: input,
  });

/** Montants des frais scolaires : centièmes d'unité (convention de la plateforme). */
export function formatMoney(cents: number, locale = "fr-FR"): string {
  return `${(cents / 100).toLocaleString(locale, { maximumFractionDigits: 0 })} FCFA`;
}
export const toCents = (value: string | number): number => Math.round(Number(value) * 100);

/** Choix faits à l'inscription : options, remises prédéfinies, remise au cas par cas. */
export interface EnrollmentFeeChoices {
  optionalFeeStructureIds: string[];
  discountPresetIds: string[];
  manualDiscounts: ManualDiscount[];
}

export const EMPTY_FEE_CHOICES: EnrollmentFeeChoices = {
  optionalFeeStructureIds: [],
  discountPresetIds: [],
  manualDiscounts: [],
};

/** Libellé lisible d'une échéance : inscription, tranche n, pénalité, ou première ligne. */
export function dueLabel(
  invoice: Pick<ScheduleInvoice, "kind" | "installmentSequence" | "items" | "number">,
  t: TFunction<"app">,
): string {
  if (invoice.kind === "REGISTRATION") return t("fees.due.registration");
  if (invoice.kind === "PENALTY") return t("fees.due.penalty");
  if (invoice.kind === "INSTALLMENT" && invoice.installmentSequence)
    return t("fees.plans.trancheN", { n: invoice.installmentSequence });
  return invoice.items[0]?.description ?? invoice.number;
}
