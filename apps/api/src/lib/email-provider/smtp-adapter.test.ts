import type { Transporter } from "nodemailer";
import { describe, expect, it, vi } from "vitest";

import { SmtpEmailAdapter } from "./smtp-adapter.js";

describe("SmtpEmailAdapter", () => {
  it("sends through the injected transporter with the configured from address", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "test" });
    const fakeTransporter = { sendMail } as unknown as Transporter;
    const adapter = new SmtpEmailAdapter(
      {
        host: "smtp.test",
        port: 587,
        secure: false,
        user: "u",
        password: "p",
        fromAddress: "noreply@edu.test",
      },
      fakeTransporter,
    );

    await adapter.send({ to: "parent@example.test", subject: "Hello", text: "Body" });

    expect(sendMail).toHaveBeenCalledWith({
      from: "noreply@edu.test",
      to: "parent@example.test",
      subject: "Hello",
      text: "Body",
    });
  });
});
