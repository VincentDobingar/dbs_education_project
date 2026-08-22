import twilio from "twilio";

import type { SendSmsInput, SmsProviderAdapter } from "./types.js";

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

type TwilioClient = ReturnType<typeof twilio>;

/**
 * Generic Twilio transport. `client` is injectable so tests can pass a fake without
 * a real Twilio account.
 */
export class TwilioSmsAdapter implements SmsProviderAdapter {
  readonly code = "TWILIO";
  private readonly client: TwilioClient;

  constructor(
    private readonly config: TwilioConfig,
    client?: TwilioClient,
  ) {
    this.client = client ?? twilio(config.accountSid, config.authToken);
  }

  async send(input: SendSmsInput): Promise<void> {
    await this.client.messages.create({ to: input.to, from: this.config.fromNumber, body: input.body });
  }
}
