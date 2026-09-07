import { loadAdminSession, type AdminSession } from "./adminSession.js";

/**
 * Every page under AdminLayout is already guarded — reaching here with no session
 * means AdminLayout's redirect didn't run, a programming error, not a normal state
 * to render around. Mirrors useSession.ts:useRequiredSession for the tenant app.
 */
export function useRequiredAdminSession(): AdminSession {
  const session = loadAdminSession();
  if (!session) {
    throw new Error("useRequiredAdminSession called outside an authenticated platform route");
  }
  return session;
}
