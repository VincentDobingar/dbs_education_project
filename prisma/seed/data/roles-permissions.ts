export const PLATFORM_ROLES = [
  { code: "SUPER_ADMIN", nameFr: "Super administrateur", nameEn: "Super Admin" },
  { code: "PLATFORM_ADMIN", nameFr: "Administrateur plateforme", nameEn: "Platform Admin" },
  { code: "SUPPORT_AGENT", nameFr: "Agent support", nameEn: "Support Agent" },
  { code: "BILLING_MANAGER", nameFr: "Responsable facturation", nameEn: "Billing Manager" },
  { code: "COMMERCIAL_MANAGER", nameFr: "Responsable commercial", nameEn: "Commercial Manager" },
  { code: "PLATFORM_AUDITOR", nameFr: "Auditeur plateforme", nameEn: "Platform Auditor" },
] as const;

export const TENANT_ROLES = [
  { code: "SCHOOL_OWNER", nameFr: "Propriétaire établissement", nameEn: "School Owner" },
  { code: "SCHOOL_ADMIN", nameFr: "Administrateur établissement", nameEn: "School Admin" },
  { code: "DIRECTOR", nameFr: "Directeur", nameEn: "Director" },
  { code: "ACADEMIC_DIRECTOR", nameFr: "Directeur académique", nameEn: "Academic Director" },
  { code: "SECRETARY", nameFr: "Secrétaire", nameEn: "Secretary" },
  { code: "ACCOUNTANT", nameFr: "Comptable", nameEn: "Accountant" },
  { code: "HR_MANAGER", nameFr: "Responsable RH", nameEn: "HR Manager" },
  { code: "TEACHER", nameFr: "Enseignant", nameEn: "Teacher" },
  { code: "SUPERVISOR", nameFr: "Surveillant", nameEn: "Supervisor" },
  { code: "LIBRARIAN", nameFr: "Bibliothécaire", nameEn: "Librarian" },
  { code: "TRANSPORT_MANAGER", nameFr: "Responsable transport", nameEn: "Transport Manager" },
  { code: "TENANT_AUDITOR", nameFr: "Auditeur établissement", nameEn: "Tenant Auditor" },
] as const;

export const INDIVIDUAL_ROLES = [
  { code: "PARENT", nameFr: "Parent", nameEn: "Parent" },
  { code: "STUDENT", nameFr: "Élève", nameEn: "Student" },
] as const;

export const PERMISSIONS = [
  {
    code: "students.read",
    module: "students",
    descriptionFr: "Consulter les élèves",
    descriptionEn: "View students",
  },
  {
    code: "students.write",
    module: "students",
    descriptionFr: "Gérer les élèves",
    descriptionEn: "Manage students",
  },
  {
    code: "grades.read",
    module: "grades",
    descriptionFr: "Consulter les notes",
    descriptionEn: "View grades",
  },
  {
    code: "grades.write",
    module: "grades",
    descriptionFr: "Saisir les notes",
    descriptionEn: "Enter grades",
  },
  {
    code: "grades.publish",
    module: "grades",
    descriptionFr: "Publier les bulletins",
    descriptionEn: "Publish report cards",
  },
  {
    code: "attendance.read",
    module: "attendance",
    descriptionFr: "Consulter les présences",
    descriptionEn: "View attendance",
  },
  {
    code: "attendance.write",
    module: "attendance",
    descriptionFr: "Saisir les présences",
    descriptionEn: "Record attendance",
  },
  {
    code: "discipline.read",
    module: "discipline",
    descriptionFr: "Consulter les incidents disciplinaires",
    descriptionEn: "View disciplinary incidents",
  },
  {
    code: "discipline.write",
    module: "discipline",
    descriptionFr: "Gérer les incidents disciplinaires",
    descriptionEn: "Manage disciplinary incidents",
  },
  {
    code: "finance.read",
    module: "finance",
    descriptionFr: "Consulter les finances",
    descriptionEn: "View finances",
  },
  {
    code: "finance.write",
    module: "finance",
    descriptionFr: "Gérer les finances",
    descriptionEn: "Manage finances",
  },
  { code: "hr.manage", module: "hr", descriptionFr: "Gérer le personnel", descriptionEn: "Manage staff" },
  {
    code: "tenant.settings.manage",
    module: "tenant",
    descriptionFr: "Gérer les paramètres de l'établissement",
    descriptionEn: "Manage school settings",
  },
  {
    code: "subscriptions.manage",
    module: "billing",
    descriptionFr: "Gérer les abonnements",
    descriptionEn: "Manage subscriptions",
  },
  {
    code: "platform.tenants.manage",
    module: "platform",
    descriptionFr: "Gérer les établissements (plateforme)",
    descriptionEn: "Manage tenants (platform)",
  },
  {
    code: "platform.support.manage",
    module: "platform",
    descriptionFr: "Gérer le support (plateforme)",
    descriptionEn: "Manage support (platform)",
  },
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number]["code"];

/** Default role -> permission mapping. Expanded module by module as each feature ships. */
export const ROLE_PERMISSIONS: Record<string, readonly PermissionCode[]> = {
  SUPER_ADMIN: ["platform.tenants.manage", "platform.support.manage", "subscriptions.manage"],
  PLATFORM_ADMIN: ["platform.tenants.manage"],
  SUPPORT_AGENT: ["platform.support.manage"],
  BILLING_MANAGER: ["subscriptions.manage"],
  COMMERCIAL_MANAGER: ["subscriptions.manage"],
  PLATFORM_AUDITOR: [],

  SCHOOL_OWNER: [
    "students.read",
    "students.write",
    "grades.read",
    "grades.publish",
    "attendance.read",
    "discipline.read",
    "finance.read",
    "finance.write",
    "hr.manage",
    "tenant.settings.manage",
    "subscriptions.manage",
  ],
  SCHOOL_ADMIN: [
    "students.read",
    "students.write",
    "grades.read",
    "attendance.read",
    "discipline.read",
    "finance.read",
    "tenant.settings.manage",
  ],
  DIRECTOR: [
    "students.read",
    "grades.read",
    "grades.publish",
    "attendance.read",
    "discipline.read",
    "discipline.write",
    "finance.read",
  ],
  ACADEMIC_DIRECTOR: [
    "students.read",
    "grades.read",
    "grades.write",
    "grades.publish",
    "attendance.read",
    "discipline.read",
  ],
  SECRETARY: ["students.read", "students.write"],
  ACCOUNTANT: ["finance.read", "finance.write"],
  HR_MANAGER: ["hr.manage"],
  TEACHER: [
    "students.read",
    "grades.read",
    "grades.write",
    "attendance.read",
    "attendance.write",
    "discipline.read",
    "discipline.write",
  ],
  SUPERVISOR: ["attendance.read", "attendance.write", "discipline.read", "discipline.write"],
  LIBRARIAN: [],
  TRANSPORT_MANAGER: [],
  TENANT_AUDITOR: ["students.read", "grades.read", "attendance.read", "discipline.read", "finance.read"],

  PARENT: [],
  STUDENT: [],
};
