// Separate from lib/session.ts on purpose: a parent/student is never a tenant
// member (no subdomain, no tenantId, no roleCodes) — this session shape reflects
// that a beneficiary account can be linked to schools/children across tenants.
export interface PortalSession {
  accessToken: string;
  refreshToken: string;
  email: string;
}

const STORAGE_KEY = "edumanage.portal-session";

export function loadPortalSession(): PortalSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as PortalSession;
  } catch {
    return null;
  }
}

export function savePortalSession(session: PortalSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearPortalSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
