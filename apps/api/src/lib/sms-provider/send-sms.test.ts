import { afterEach, describe, expect, it, vi } from "vitest";

import { registerSmsProviderAdapter, resetSmsProviderAdapter } from "./registry.js";
import { sendSms } from "./send-sms.js";
import type { SmsProviderAdapter } from "./types.js";

describe("SMS provider registry + sendSms", () => {
  afterEach(() => {
    resetSmsProviderAdapter();
  });

  it("no-ops without throwing when no provider is registered", () => {
    expect(() => sendSms({ to: "+237600000000", body: "hello" })).not.toThrow();
  });

  it("calls the registered adapter with the given input", () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const fakeAdapter: SmsProviderAdapter = { code: "FAKE", send };
    registerSmsProviderAdapter(fakeAdapter);

    sendSms({ to: "+237600000000", body: "hello" });

    expect(send).toHaveBeenCalledWith({ to: "+237600000000", body: "hello" });
  });

  it("swallows a send failure without throwing", () => {
    const send = vi.fn().mockRejectedValue(new Error("boom"));
    registerSmsProviderAdapter({ code: "FAKE", send });

    expect(() => sendSms({ to: "+237600000000", body: "hello" })).not.toThrow();
    expect(send).toHaveBeenCalled();
  });
});
