import type { EmailProviderAdapter, SendEmailInput } from "./types.js";

export interface BrevoConfig {
  apiKey: string;
  fromAddress: string;
  fromName: string;
}

export const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";

/**
 * Envoi par l'API HTTP de Brevo (HTTPS, port 443) plutôt qu'en SMTP : certains
 * hébergeurs (Railway hors offre Pro, notamment) bloquent les ports SMTP sortants
 * 25/465/587 — la connexion SMTP y échoue en « Connection timeout ». `fetchImpl`
 * est injectable pour les tests.
 */
export class BrevoEmailAdapter implements EmailProviderAdapter {
  readonly code = "BREVO";

  constructor(
    private readonly config: BrevoConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(input: SendEmailInput): Promise<void> {
    const response = await this.fetchImpl(BREVO_SEND_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": this.config.apiKey,
      },
      body: JSON.stringify({
        sender: { email: this.config.fromAddress, name: this.config.fromName },
        to: [{ email: input.to }],
        subject: input.subject,
        textContent: input.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      // Le corps d'erreur Brevo ({ code, message }) ne contient jamais la clé.
      const detail = await response.text().catch(() => "");
      throw new Error(`Brevo API ${response.status}: ${detail.slice(0, 300)}`);
    }
  }
}
