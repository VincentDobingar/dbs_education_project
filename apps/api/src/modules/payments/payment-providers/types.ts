export type NormalizedTransactionStatus = "SUCCEEDED" | "FAILED" | "CANCELLED";

export interface NormalizedWebhookEvent {
  externalEventId: string;
  externalReference: string;
  /** Our PaymentIntent.idempotencyKey, echoed back by the provider (passed at initiation time). */
  merchantReference: string;
  status: NormalizedTransactionStatus;
  amountCents: number;
}

export interface WebhookVerificationInput {
  rawBody: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * One adapter per webhook-driven payment operator (§24: "les opérateurs Mobile
 * Money doivent pouvoir être ajoutés sans réécrire toute la logique d'abonnement").
 * Cash/manual payments do not implement this — they are agent-initiated and
 * synchronous, handled directly by payment.service.ts's recordManualCashPayment.
 */
export interface PaymentInitiationInput {
  /** Our PaymentIntent.idempotencyKey — echoed back by the operator in its webhook. */
  merchantReference: string;
  /** Minor units of the currency (Currency.decimalDigits), like every *Cents field. */
  amountCents: number;
  currencyIsoCode: string;
  currencyDecimalDigits: number;
  /** Customer wallet / phone number in international format (+235…). */
  customerPhone: string;
  description: string;
}

export interface PaymentInitiationResult {
  /** Operator transaction id, when the operator returns one synchronously. */
  externalReference: string | null;
  /** Text to show the payer (e.g. "Confirmez le paiement sur votre téléphone"). */
  customerMessage: string | null;
}

export interface PaymentProviderAdapter {
  code: string;
  verifyWebhookSignature(input: WebhookVerificationInput): boolean;
  parseWebhookEvent(rawBody: string): NormalizedWebhookEvent;
  /**
   * Payer-initiated collection (push request to the payer's wallet). Optional:
   * webhook-only adapters (payment started outside the platform) omit it. The
   * outcome always arrives later through the webhook, never from this call.
   */
  initiatePayment?(input: PaymentInitiationInput): Promise<PaymentInitiationResult>;
}
