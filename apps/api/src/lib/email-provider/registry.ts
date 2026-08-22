import type { EmailProviderAdapter } from "./types.js";

/**
 * Single active outbound channel — unlike payment providers (§24, routed per
 * PaymentProvider.code because several operators can be live at once), there is
 * only ever one email transport for the whole app. Deliberately unregistered by
 * default: nothing lights this up until SMTP_* env vars are present (see
 * lib/notification-channels.ts) — until then, sendEmail() no-ops and logs, exactly
 * like the current "token returned in the response" behavior it is layered on top of.
 */
let activeAdapter: EmailProviderAdapter | null = null;

export function registerEmailProviderAdapter(adapter: EmailProviderAdapter): void {
  activeAdapter = adapter;
}

export function getEmailProviderAdapter(): EmailProviderAdapter | null {
  return activeAdapter;
}

/** Test-only: isolates registration between test files/suites. */
export function resetEmailProviderAdapter(): void {
  activeAdapter = null;
}
