import { clearAdminSession, loadAdminSession, saveAdminSession } from "./adminSession.js";
import { clearPortalSession, loadPortalSession, savePortalSession } from "./portalSession.js";
import { clearSession, loadSession, saveSession } from "./session.js";

const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Shared by every tenant-scoped API call (school-config, students, ...) so callers
// pass one object instead of two positional args at each call site.
export interface TenantCredentials {
  accessToken: string;
  subdomain: string;
}

// Which local session store a call belongs to (§34, access token refresh below) —
// a staff member, a parent/student portal beneficiary, and a platform admin are
// three independent sessions that can coexist in the same browser. Defaults to
// "staff" since that's who the overwhelming majority of API modules speak for;
// only parentPortalApi.ts/studentPortalApi.ts/platformAdminApi.ts would need to
// pass another value, left unwired for now — narrower fix than this bug needed.
export type AuthContext = "staff" | "portal" | "admin";

const LOGIN_PATH: Record<AuthContext, string> = {
  staff: "/connexion",
  portal: "/portail/connexion",
  admin: "/admin/connexion",
};

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

function loadStoredRefreshToken(context: AuthContext): string | null {
  if (context === "staff") return loadSession()?.refreshToken ?? null;
  if (context === "portal") return loadPortalSession()?.refreshToken ?? null;
  return loadAdminSession()?.refreshToken ?? null;
}

function persistRefreshedTokens(context: AuthContext, tokens: StoredTokens): void {
  if (context === "staff") {
    const current = loadSession();
    if (current) saveSession({ ...current, ...tokens });
    return;
  }
  if (context === "portal") {
    const current = loadPortalSession();
    if (current) savePortalSession({ ...current, ...tokens });
    return;
  }
  const current = loadAdminSession();
  if (current) saveAdminSession({ ...current, ...tokens });
}

function clearAndRedirectToLogin(context: AuthContext): void {
  if (context === "staff") clearSession();
  else if (context === "portal") clearPortalSession();
  else clearAdminSession();
  window.location.assign(LOGIN_PATH[context]);
}

// §34 : le token d'accès est volontairement court (15 min) — sans ceci, toute
// session ouverte plus longtemps qu'un quart d'heure se met à échouer en 401 sur
// le premier appel suivant, alors qu'un refresh token (rotatif, 30 jours) existe
// justement pour ça côté API (POST /auth/refresh) et n'était jusqu'ici jamais
// appelé par le frontend. Une seule tentative de rafraîchissement par requête
// (jamais de boucle) ; plusieurs 401 concurrents partagent le même appel de
// rafraîchissement plutôt que d'en déclencher un par requête en échec.
const refreshInFlight = new Map<AuthContext, Promise<string | null>>();

async function refreshAccessToken(context: AuthContext): Promise<string | null> {
  const existing = refreshInFlight.get(context);
  if (existing) return existing;

  const attempt = (async (): Promise<string | null> => {
    const refreshToken = loadStoredRefreshToken(context);
    if (!refreshToken) return null;

    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) return null;

      const tokens = (await response.json()) as StoredTokens;
      persistRefreshedTokens(context, tokens);
      return tokens.accessToken;
    } catch {
      return null;
    }
  })();

  refreshInFlight.set(context, attempt);
  try {
    return await attempt;
  } finally {
    refreshInFlight.delete(context);
  }
}

/**
 * Runs `send` (a plain `fetch`) once; on a 401 whose body carries
 * `code: "UNAUTHENTICATED"` (requireAuth.ts — an expired/invalid access token,
 * never a wrong-password/wrong-refresh-token 401, which use different codes and
 * so are never mistaken for this), refreshes the access token once and retries
 * with it substituted into the Authorization header. If refresh itself fails,
 * the session is cleared and the browser is sent to that context's login page —
 * matches the existing manual "Déconnexion" flow rather than inventing a new one.
 */
async function fetchWithAuthRetry(
  path: string,
  init: RequestInit,
  accessToken: string | undefined,
  authContext: AuthContext,
): Promise<Response> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (response.status !== 401 || !accessToken) {
    return response;
  }

  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as { code?: string } | null;
  if (body?.code !== "UNAUTHENTICATED") {
    return response;
  }

  const newAccessToken = await refreshAccessToken(authContext);
  if (!newAccessToken) {
    clearAndRedirectToLogin(authContext);
    return response;
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${newAccessToken}`);
  return fetch(`${API_URL}${path}`, { ...init, headers });
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  accessToken?: string;
  // Dev-only stand-in for real wildcard-subdomain DNS (see enforceTenantScope.ts
  // on the API side) — every tenant-scoped route needs this until the app is
  // actually served from each school's own subdomain.
  subdomain?: string;
  authContext?: AuthContext;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetchWithAuthRetry(
    path,
    {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
        ...(options.subdomain ? { "X-Tenant-Slug": options.subdomain } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    },
    options.accessToken,
    options.authContext ?? "staff",
  );

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const errorBody = data as { code?: string; message?: string } | null;
    throw new ApiError(
      response.status,
      errorBody?.code ?? "UNKNOWN_ERROR",
      errorBody?.message ?? "Request failed",
    );
  }

  return data as T;
}

// Multipart upload (logo d'établissement pour l'instant) — pas de Content-Type
// manuel : le navigateur doit poser lui-même l'en-tête multipart/form-data avec
// sa frontière (boundary), qu'apiRequest écraserait en imposant application/json.
export async function apiUpload<T>(
  path: string,
  fieldName: string,
  file: File,
  options: { accessToken: string; subdomain?: string; authContext?: AuthContext },
): Promise<T> {
  const formData = new FormData();
  formData.append(fieldName, file);

  const response = await fetchWithAuthRetry(
    path,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        ...(options.subdomain ? { "X-Tenant-Slug": options.subdomain } : {}),
      },
      body: formData,
    },
    options.accessToken,
    options.authContext ?? "staff",
  );

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const errorBody = data as { code?: string; message?: string } | null;
    throw new ApiError(
      response.status,
      errorBody?.code ?? "UNKNOWN_ERROR",
      errorBody?.message ?? "Upload failed",
    );
  }

  return data as T;
}

// Not JSON — a raw fetch reusing the same auth/tenant headers as apiRequest, but
// returning bytes for the caller to open/download (PDF/CSV/Excel exports) rather
// than parsing a JSON body. `subdomain` is optional so both tenant-scoped callers
// (financeApi.ts, studentsApi.ts...) and portal callers with no tenant context
// (studentPortalApi.ts, parentPortalApi.ts) can share this one implementation —
// previously duplicated verbatim in three separate files before this extraction.
export async function fetchBlob(
  path: string,
  options: { accessToken: string; subdomain?: string; authContext?: AuthContext },
): Promise<Blob> {
  const response = await fetchWithAuthRetry(
    path,
    {
      headers: {
        Authorization: `Bearer ${options.accessToken}`,
        ...(options.subdomain ? { "X-Tenant-Slug": options.subdomain } : {}),
      },
    },
    options.accessToken,
    options.authContext ?? "staff",
  );
  if (!response.ok) {
    throw new ApiError(response.status, "FILE_FETCH_FAILED", "Could not load the file");
  }
  return response.blob();
}
