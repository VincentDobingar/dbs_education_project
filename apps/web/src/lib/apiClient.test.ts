import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest, ApiError } from "./apiClient.js";
import { loadSession, saveSession } from "./session.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiClient — refresh on an expired access token (§34)", () => {
  let locationAssignMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    saveSession({
      accessToken: "old-access-token",
      refreshToken: "old-refresh-token",
      subdomain: "ecole-test",
      tenantId: "tenant-1",
      tenantName: "École Test",
      email: "owner@example.test",
      roleCodes: ["SCHOOL_OWNER"],
    });
    // jsdom's real `window.location.assign` refuses navigation and can't be
    // spied on directly (its `assign` property isn't configurable) — swap the
    // whole object for a stub for the duration of each test.
    locationAssignMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { assign: locationAssignMock },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes a normal successful response straight through, with no extra calls", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiRequest<{ ok: boolean }>("/school-config/tenant-logo", {
      accessToken: "old-access-token",
      subdomain: "ecole-test",
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes an expired access token once and retries the original request with it", async () => {
    const fetchMock = vi
      .fn()
      // 1) the original request, rejected for an expired token
      .mockResolvedValueOnce(
        jsonResponse(401, { code: "UNAUTHENTICATED", message: "Invalid or expired access token" }),
      )
      // 2) POST /auth/refresh
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: "new-access-token", refreshToken: "new-refresh-token" }),
      )
      // 3) the retried original request
      .mockResolvedValueOnce(jsonResponse(200, { logoUrl: "https://example.test/logo.png" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiRequest<{ logoUrl: string }>("/school-config/tenant-logo", {
      accessToken: "old-access-token",
      subdomain: "ecole-test",
    });

    expect(result).toEqual({ logoUrl: "https://example.test/logo.png" });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const refreshCall = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(refreshCall[0]).toContain("/auth/refresh");
    expect(JSON.parse(refreshCall[1].body as string)).toEqual({ refreshToken: "old-refresh-token" });

    const retryCall = fetchMock.mock.calls[2] as [string, RequestInit];
    const retryHeaders = new Headers(retryCall[1].headers);
    expect(retryHeaders.get("Authorization")).toBe("Bearer new-access-token");

    // The refreshed tokens are persisted, so the next call starts from them.
    expect(loadSession()?.accessToken).toBe("new-access-token");
    expect(loadSession()?.refreshToken).toBe("new-refresh-token");
  });

  it("clears the session and redirects to /connexion when the refresh token itself is rejected", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(401, { code: "UNAUTHENTICATED", message: "Invalid or expired access token" }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, { code: "INVALID_REFRESH_TOKEN", message: "Refresh token is invalid or expired" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("/school-config/tenant-logo", { accessToken: "old-access-token", subdomain: "ecole-test" }),
    ).rejects.toThrow(ApiError);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(loadSession()).toBeNull();
    expect(locationAssignMock).toHaveBeenCalledWith("/connexion");
  });

  it("never attempts a refresh for a 401 that isn't an expired-token error (e.g. a rejected login)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(401, { code: "INVALID_CREDENTIALS", message: "Invalid email or password" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("/auth/login", { method: "POST", body: { email: "x", password: "y" } }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });

    // A single call: no /auth/refresh attempt, no retry.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
