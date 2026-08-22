import nodemailer, { type Transporter } from "nodemailer";

import type { EmailProviderAdapter, SendEmailInput } from "./types.js";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromAddress: string;
}

/**
 * Generic SMTP transport via nodemailer — works with Gmail, a hosting provider's
 * mail server, Mailtrap for a sandbox, etc. `transporter` is injectable so tests can
 * pass a fake without a real SMTP server.
 */
export class SmtpEmailAdapter implements EmailProviderAdapter {
  readonly code = "SMTP";
  private readonly transporter: Transporter;

  constructor(
    private readonly config: SmtpConfig,
    transporter?: Transporter,
  ) {
    this.transporter =
      transporter ??
      nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.user, pass: config.password },
      });
  }

  async send(input: SendEmailInput): Promise<void> {
    await this.transporter.sendMail({
      from: this.config.fromAddress,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
  }
}
