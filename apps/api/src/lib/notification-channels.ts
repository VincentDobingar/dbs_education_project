import { env } from "../env.js";

import { registerEmailProviderAdapter } from "./email-provider/registry.js";
import { SmtpEmailAdapter } from "./email-provider/smtp-adapter.js";
import { registerSmsProviderAdapter } from "./sms-provider/registry.js";
import { TwilioSmsAdapter } from "./sms-provider/twilio-adapter.js";

/**
 * Called once at boot (index.ts). Registering a real adapter here is the only step
 * needed to light up real delivery once credentials exist — nothing else in
 * auth/family/communication changes (same philosophy as
 * payment-providers/registry.ts for Mobile Money, §24). Left unregistered in
 * dev/test until the SMTP and Twilio env vars are set — sendEmail/sendSms then
 * no-op and log, exactly like the current "token returned in the response" behavior.
 */
export function bootstrapNotificationChannels(): void {
  if (env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASSWORD && env.SMTP_FROM_ADDRESS) {
    registerEmailProviderAdapter(
      new SmtpEmailAdapter({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE ?? false,
        user: env.SMTP_USER,
        password: env.SMTP_PASSWORD,
        fromAddress: env.SMTP_FROM_ADDRESS,
      }),
    );
  }

  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER) {
    registerSmsProviderAdapter(
      new TwilioSmsAdapter({
        accountSid: env.TWILIO_ACCOUNT_SID,
        authToken: env.TWILIO_AUTH_TOKEN,
        fromNumber: env.TWILIO_FROM_NUMBER,
      }),
    );
  }
}
