import type { PaymentProviderAdapter } from "./types.js";

/**
 * In-memory registry, keyed by PaymentProvider.code. Deliberately not pre-populated
 * with real Mobile Money adapters: none of Orange Money / MTN MoMo / M-Pesa / Airtel
 * Money have a signed operator contract or sandbox credentials yet (see
 * docs/architecture.md). Registering a real adapter here is the only step needed
 * to light one up once credentials exist — nothing else in the payment pipeline
 * changes (§24).
 */
const adapters = new Map<string, PaymentProviderAdapter>();

export function registerPaymentProviderAdapter(adapter: PaymentProviderAdapter): void {
  adapters.set(adapter.code, adapter);
}

export function getPaymentProviderAdapter(code: string): PaymentProviderAdapter | undefined {
  return adapters.get(code);
}
