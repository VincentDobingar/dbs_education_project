// Separate from lib/session.ts (tenant staff) and lib/portalSession.ts (parent/
// student) on purpose: a platform admin (§31) is never a tenant member and never a
// portal beneficiary — UserRole.tenantId === null, no subdomain, cross-tenant by
// nature. platformRoleCodes comes from GET /auth/me (see auth.service.ts) and is
// the only thing that decides whether /admin is open to this account.
export interface AdminSession {
  accessToken: string;
  refreshToken: string;
  email: string;
  platformRoleCodes: string[];
}

const STORAGE_KEY = "edumanage.admin-session";

export function loadAdminSession(): AdminSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as AdminSession;
  } catch {
    return null;
  }
}

export function saveAdminSession(session: AdminSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearAdminSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
