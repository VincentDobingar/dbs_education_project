import { env } from "../env.js";
import { KonoomPaymentAdapter } from "../modules/payments/payment-providers/konoom-provider.js";
import { registerPaymentProviderAdapter } from "../modules/payments/payment-providers/registry.js";

/** Codes PaymentProvider servis par Konoom (prisma/seed/data/payment-providers.ts). */
export const KONOOM_PROVIDER_CODES = ["KONOOM_TD", "KONOOM_CM"] as const;

/**
 * Appelée une fois au démarrage (index.ts), comme bootstrapNotificationChannels :
 * un opérateur n'est branché que lorsque tous ses identifiants existent — jamais
 * un démarrage qui échoue faute de contrat signé.
 */
export function bootstrapPaymentChannels(): void {
  if (env.KONOOM_API_BASE_URL && env.KONOOM_API_KEY && env.KONOOM_MERCHANT_ID && env.KONOOM_WEBHOOK_SECRET) {
    for (const code of KONOOM_PROVIDER_CODES) {
      registerPaymentProviderAdapter(
        new KonoomPaymentAdapter(code, {
          baseUrl: env.KONOOM_API_BASE_URL,
          apiKey: env.KONOOM_API_KEY,
          merchantId: env.KONOOM_MERCHANT_ID,
          webhookSecret: env.KONOOM_WEBHOOK_SECRET,
          callbackUrl: `${env.PUBLIC_API_URL.replace(/\/$/, "")}/api/v1/payments/webhooks/${code}`,
        }),
      );
    }
  }
}
