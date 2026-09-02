export interface Session {
  accessToken: string;
  refreshToken: string;
  subdomain: string;
  tenantId: string;
  tenantName: string;
  email: string;
  roleCodes: string[];
}

const STORAGE_KEY = "edumanage.session";

export function loadSession(): Session | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
