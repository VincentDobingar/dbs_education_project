/**
 * Every Prisma model whose `tenantId` column is required (non-nullable). These are
 * the models the tenant-guard Prisma extension (see prisma.ts) automatically scopes.
 *
 * Models with a NULLABLE tenantId (Notification, MessageTemplate, SupportTicket,
 * Document, UserRole, AuditLog, SubscriptionOwner) are deliberately excluded: they
 * can be platform-wide OR tenant-specific, so scoping them is a service-layer
 * decision, not something a generic extension can decide safely.
 *
 * Keep this list in sync with prisma/schema/*.prisma — a model added there with a
 * required tenantId must be added here too, or it will NOT be protected against
 * cross-tenant reads/writes.
 */
export const TENANT_SCOPED_MODELS = [
  "AcademicYear",
  "AcademicPeriod",
  "EducationCycle",
  "GradeLevel",
  "Program",
  "Department",
  "Classroom",
  "Subject",
  "SubjectCoefficient",
  "TeacherAssignment",
  "Timetable",
  "TimetableEntry",
  "Announcement",
  "ParentStudentRelationship",
  "ActivationInvitation",
  "StudentUserLink",
  "FeeCategory",
  "FeeStructure",
  "StudentInvoice",
  "StudentPayment",
  "StudentReceipt",
  "ExpenseCategory",
  "Expense",
  "CashSession",
  "StudentPaymentRefund",
  "AssessmentType",
  "Assessment",
  "Grade",
  "ReportCard",
  "Employee",
  "EmploymentContract",
  "LeaveRequest",
  "EmployeeAttendance",
  "PerformanceEvaluation",
  "EmployeeDocument",
  "TenantMembership",
  "TenantDomain",
  "TenantSetting",
  "Campus",
  "Student",
  "Enrollment",
  "StudentDocument",
  "Attendance",
  "DisciplinaryIncident",
  "Book",
  "LibraryLoan",
  "Homework",
  "HomeworkSubmission",
  "OnlineCourse",
  "CourseResource",
  "ResourceProgress",
  "Vehicle",
  "TransportRoute",
  "RouteStop",
  "StudentRouteAssignment",
  "TransportAttendance",
  "Menu",
  "MealPlan",
  "StudentMealEnrollment",
  "MealAttendance",
] as const;

export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

const TENANT_SCOPED_MODEL_SET = new Set<string>(TENANT_SCOPED_MODELS);

export function isTenantScopedModel(model: string): model is TenantScopedModel {
  return TENANT_SCOPED_MODEL_SET.has(model);
}
