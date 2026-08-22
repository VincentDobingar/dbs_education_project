export interface SendSmsInput {
  to: string;
  body: string;
}

/**
 * One adapter per SMS transport (§28 : canaux de notification réels). Twilio is the
 * only implementation today; a local aggregator (Orange/MTN...) would implement this
 * the same way once a contract exists (same reasoning as Mobile Money, §24).
 */
export interface SmsProviderAdapter {
  code: string;
  send: (input: SendSmsInput) => Promise<void>;
}
