import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  NormalizedWebhookEvent,
  PaymentInitiationInput,
  PaymentInitiationResult,
  PaymentProviderAdapter,
  WebhookVerificationInput,
} from "./types.js";

/**
 * Konoom (établissement de paiement agréé COBAC, Tchad 2025 et Cameroun 2026 —
 * KONOOM CAMEROUN S.A., arrêté n°681/MINFI) : wallet, USSD, QR marchand,
 * paiements de masse.
 *
 * ⚠️ Konoom ne publie pas de documentation d'API. Les noms de routes, de champs et
 * l'en-tête de signature ci-dessous sont les HYPOTHÈSES du contrat d'intégration
 * proposé dans le cadre du partenariat (docs/konoom-integration.md) : à aligner
 * sur la documentation que Konoom fournira, sans rien changer d'autre dans le
 * pipeline de paiement (PaymentIntent → webhook idempotent → reçu).
 *
 * Inactif tant que KONOOM_API_BASE_URL, KONOOM_API_KEY, KONOOM_MERCHANT_ID et
 * KONOOM_WEBHOOK_SECRET ne sont pas tous renseignés (lib/payment-channels.ts).
 */
export interface KonoomConfig {
  baseUrl: string;
  apiKey: string;
  merchantId: string;
  webhookSecret: string;
  /** URL publique du webhook générique : …/api/v1/payments/webhooks/<code>. */
  callbackUrl: string;
}

export const KONOOM_SIGNATURE_HEADER = "x-konoom-signature";

export class KonoomPaymentAdapter implements PaymentProviderAdapter {
  constructor(
    readonly code: string,
    private readonly config: KonoomConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async initiatePayment(input: PaymentInitiationInput): Promise<PaymentInitiationResult> {
    const amount = input.amountCents / 10 ** input.currencyDecimalDigits;
    const response = await this.fetchImpl(`${this.config.baseUrl.replace(/\/$/, "")}/v1/collections`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${this.config.apiKey}`,
        "idempotency-key": input.merchantReference,
      },
      body: JSON.stringify({
        merchant_id: this.config.merchantId,
        reference: input.merchantReference,
        amount,
        currency: input.currencyIsoCode,
        msisdn: input.customerPhone,
        description: input.description.slice(0, 120),
        callback_url: this.config.callbackUrl,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Konoom ${response.status}: ${detail.slice(0, 300)}`);
    }

    const payload = (await response.json()) as { transaction_id?: string; message?: string };
    return {
      externalReference: payload.transaction_id ?? null,
      customerMessage: payload.message ?? null,
    };
  }

  verifyWebhookSignature({ rawBody, headers }: WebhookVerificationInput): boolean {
    const header = headers[KONOOM_SIGNATURE_HEADER];
    const provided = Array.isArray(header) ? header[0] : header;
    if (!provided) return false;

    const expected = createHmac("sha256", this.config.webhookSecret).update(rawBody).digest("hex");
    const providedBuffer = Buffer.from(provided.replace(/^sha256=/, ""));
    const expectedBuffer = Buffer.from(expected);
    return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
  }

  parseWebhookEvent(rawBody: string): NormalizedWebhookEvent {
    const payload = JSON.parse(rawBody) as {
      event_id: string;
      transaction_id: string;
      reference: string;
      status: string;
      amount: number;
      currency_decimals?: number;
    };

    const statusMap: Record<string, NormalizedWebhookEvent["status"]> = {
      SUCCESS: "SUCCEEDED",
      SUCCEEDED: "SUCCEEDED",
      COMPLETED: "SUCCEEDED",
      FAILED: "FAILED",
      EXPIRED: "FAILED",
      CANCELLED: "CANCELLED",
      CANCELED: "CANCELLED",
    };
    const status = statusMap[String(payload.status).toUpperCase()];
    if (!status) {
      throw new Error(`Unrecognized Konoom status: ${payload.status}`);
    }

    // Montant en unités de la devise (le franc CFA n'a pas de décimales).
    const decimals = payload.currency_decimals ?? 0;
    return {
      externalEventId: payload.event_id,
      externalReference: payload.transaction_id,
      merchantReference: payload.reference,
      status,
      amountCents: Math.round(payload.amount * 10 ** decimals),
    };
  }
}
