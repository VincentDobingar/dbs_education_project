import { loadSession, type Session } from "./session.js";

/**
 * Every page under AppLayout is already guarded — reaching here with no session
 * means AppLayout's redirect didn't run, a programming error, not a normal state
 * to render around.
 */
export function useRequiredSession(): Session {
  const session = loadSession();
  if (!session) {
    throw new Error("useRequiredSession called outside an authenticated route");
  }
  return session;
}
