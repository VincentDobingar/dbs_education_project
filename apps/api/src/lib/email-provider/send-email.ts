import { logger } from "../logger.js";

import { getEmailProviderAdapter } from "./registry.js";
import type { SendEmailInput } from "./types.js";

/**
 * Fire-and-forget: a delivery failure must never fail the request that triggered it
 * (registration, invitation, notification) — same reasoning as payment webhooks
 * never blocking the triggering action. No-ops with a log line when no provider is
 * configured, exactly matching the previous "token returned in the response, staff
 * transmit manually" behavior — nothing regresses until SMTP is actually set up.
 */
export function sendEmail(input: SendEmailInput): void {
  const adapter = getEmailProviderAdapter();
  if (!adapter) {
    logger.info({ to: input.to, subject: input.subject }, "Email not sent: no provider configured");
    return;
  }

  void adapter.send(input).catch((err: unknown) => {
    logger.error({ err, to: input.to, subject: input.subject }, "Email send failed");
  });
}
