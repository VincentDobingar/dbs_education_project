export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
}

/**
 * One adapter per email transport (§28 : canaux de notification réels). SMTP is the
 * only implementation today; SendGrid/SES would each implement this the same way —
 * swapping transport is a new class, never a change to a caller.
 */
export interface EmailProviderAdapter {
  code: string;
  send: (input: SendEmailInput) => Promise<void>;
}
