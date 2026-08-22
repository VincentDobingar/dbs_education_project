import type { SmsProviderAdapter } from "./types.js";

/** Same reasoning as email-provider/registry.ts — a single active outbound SMS
 * channel for the whole app, unregistered by default until TWILIO_* env vars are
 * present (see lib/notification-channels.ts). */
let activeAdapter: SmsProviderAdapter | null = null;

export function registerSmsProviderAdapter(adapter: SmsProviderAdapter): void {
  activeAdapter = adapter;
}

export function getSmsProviderAdapter(): SmsProviderAdapter | null {
  return activeAdapter;
}

/** Test-only: isolates registration between test files/suites. */
export function resetSmsProviderAdapter(): void {
  activeAdapter = null;
}
