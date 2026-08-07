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
export interface PaymentProviderAdapter {
  code: string;
  verifyWebhookSignature(input: WebhookVerificationInput): boolean;
  parseWebhookEvent(rawBody: string): NormalizedWebhookEvent;
}
