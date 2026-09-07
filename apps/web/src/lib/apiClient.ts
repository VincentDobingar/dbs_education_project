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

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  accessToken?: string;
  // Dev-only stand-in for real wildcard-subdomain DNS (see enforceTenantScope.ts
  // on the API side) — every tenant-scoped route needs this until the app is
  // actually served from each school's own subdomain.
  subdomain?: string;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
      ...(options.subdomain ? { "X-Tenant-Slug": options.subdomain } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

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

// Not JSON — a raw fetch reusing the same auth/tenant headers as apiRequest, but
// returning bytes for the caller to open/download (PDF/CSV/Excel exports) rather
// than parsing a JSON body. `subdomain` is optional so both tenant-scoped callers
// (financeApi.ts, studentsApi.ts...) and portal callers with no tenant context
// (studentPortalApi.ts, parentPortalApi.ts) can share this one implementation —
// previously duplicated verbatim in three separate files before this extraction.
export async function fetchBlob(
  path: string,
  options: { accessToken: string; subdomain?: string },
): Promise<Blob> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      ...(options.subdomain ? { "X-Tenant-Slug": options.subdomain } : {}),
    },
  });
  if (!response.ok) {
    throw new ApiError(response.status, "FILE_FETCH_FAILED", "Could not load the file");
  }
  return response.blob();
}
