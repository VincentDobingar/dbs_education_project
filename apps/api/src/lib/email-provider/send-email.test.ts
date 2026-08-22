import { afterEach, describe, expect, it, vi } from "vitest";

import { registerEmailProviderAdapter, resetEmailProviderAdapter } from "./registry.js";
import { sendEmail } from "./send-email.js";
import type { EmailProviderAdapter } from "./types.js";

describe("email provider registry + sendEmail", () => {
  afterEach(() => {
    resetEmailProviderAdapter();
  });

  it("no-ops without throwing when no provider is registered", () => {
    expect(() => sendEmail({ to: "a@b.test", subject: "s", text: "t" })).not.toThrow();
  });

  it("calls the registered adapter with the given input", () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const fakeAdapter: EmailProviderAdapter = { code: "FAKE", send };
    registerEmailProviderAdapter(fakeAdapter);

    sendEmail({ to: "a@b.test", subject: "s", text: "t" });

    expect(send).toHaveBeenCalledWith({ to: "a@b.test", subject: "s", text: "t" });
  });

  it("swallows a send failure without throwing", () => {
    const send = vi.fn().mockRejectedValue(new Error("boom"));
    registerEmailProviderAdapter({ code: "FAKE", send });

    expect(() => sendEmail({ to: "a@b.test", subject: "s", text: "t" })).not.toThrow();
    expect(send).toHaveBeenCalled();
  });
});
