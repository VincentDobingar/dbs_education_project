import { createHmac, timingSafeEqual } from "node:crypto";

import type { NormalizedWebhookEvent, PaymentProviderAdapter, WebhookVerificationInput } from "./types.js";

/**
 * Reference implementation for the common "HMAC-SHA256 over the raw body" webhook
 * signing scheme several Mobile Money / card operators use. Real integrations
 * (Orange Money, MTN MoMo, M-Pesa, ...) each have their own header name, payload
 * shape, and sometimes a different signing algorithm — copy this class and adjust
 * against that operator's actual API docs rather than assuming it works as-is;
 * this is a template + the one path that's actually exercised by tests until a
 * real operator contract is signed.
 */
export class HmacSignedProviderAdapter implements PaymentProviderAdapter {
  constructor(
    readonly code: string,
    private readonly secret: string,
    private readonly signatureHeader = "x-signature",
  ) {}

  verifyWebhookSignature({ rawBody, headers }: WebhookVerificationInput): boolean {
    const header = headers[this.signatureHeader];
    const provided = Array.isArray(header) ? header[0] : header;

    if (!provided) {
      return false;
    }

    const expected = createHmac("sha256", this.secret).update(rawBody).digest("hex");
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);

    return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
  }

  parseWebhookEvent(rawBody: string): NormalizedWebhookEvent {
    const payload = JSON.parse(rawBody) as {
      eventId: string;
      reference: string;
      merchantReference: string;
      status: string;
      amountCents: number;
    };

    const statusMap: Record<string, NormalizedWebhookEvent["status"]> = {
      success: "SUCCEEDED",
      succeeded: "SUCCEEDED",
      failed: "FAILED",
      cancelled: "CANCELLED",
    };

    const status = statusMap[payload.status.toLowerCase()];
    if (!status) {
      throw new Error(`Unrecognized webhook status: ${payload.status}`);
    }

    return {
      externalEventId: payload.eventId,
      externalReference: payload.reference,
      merchantReference: payload.merchantReference,
      status,
      amountCents: payload.amountCents,
    };
  }
}
