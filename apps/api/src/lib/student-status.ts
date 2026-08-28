import type { StudentStatus } from "@prisma/client";

/**
 * §26/§31 : statuts qui doivent bloquer l'accès aux portails parent/élève — un
 * élève qui n'appartient plus activement à ce tenant. Même famille de bug que
 * `Tenant.status = SUSPENDED` jamais consulté par enforceTenantScope
 * (lib/tenant-status.ts) et que `Employee.deletedAt` jamais filtré par
 * resolveActingEmployeeId (lib/acting-employee.ts) : un signal de retrait que
 * `transfer.service.ts`/`student.service.ts` écrit sur `Student.status`, mais
 * qu'aucune garde ne consultait jusqu'ici — requireLinkedStudent et
 * requireVerifiedStudentRelationship résolvent déjà `Tenant.status` pour
 * peupler req.tenant sans jamais toucher à `Student.status`/`deletedAt`.
 * PROSPECTIVE reste autorisé (pas encore inscrit, mais toujours légitime —
 * même logique que ON_LEAVE pour Employee) ; ACTIVE aussi, évidemment.
 */
export const BLOCKED_STUDENT_STATUSES: ReadonlySet<StudentStatus> = new Set([
  "TRANSFERRED",
  "GRADUATED",
  "WITHDRAWN",
  "ARCHIVED",
]);

export function isStudentUnavailable(student: { status: StudentStatus; deletedAt: Date | null }): boolean {
  return student.deletedAt !== null || BLOCKED_STUDENT_STATUSES.has(student.status);
}
