import { logger } from "../logger.js";

import { getSmsProviderAdapter } from "./registry.js";
import type { SendSmsInput } from "./types.js";

/** Same reasoning as email-provider/send-email.ts: fire-and-forget, no-ops and logs
 * when no provider is configured, never fails the triggering request. */
export function sendSms(input: SendSmsInput): void {
  const adapter = getSmsProviderAdapter();
  if (!adapter) {
    logger.info({ to: input.to }, "SMS not sent: no provider configured");
    return;
  }

  void adapter.send(input).catch((err: unknown) => {
    logger.error({ err, to: input.to }, "SMS send failed");
  });
}
