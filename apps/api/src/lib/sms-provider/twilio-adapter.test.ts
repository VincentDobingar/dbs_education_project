import type twilio from "twilio";
import { describe, expect, it, vi } from "vitest";

import { TwilioSmsAdapter } from "./twilio-adapter.js";

describe("TwilioSmsAdapter", () => {
  it("sends through the injected client with the configured from number", async () => {
    const create = vi.fn().mockResolvedValue({ sid: "SM123" });
    const fakeClient = { messages: { create } } as unknown as ReturnType<typeof twilio>;
    const adapter = new TwilioSmsAdapter(
      { accountSid: "AC_test", authToken: "token", fromNumber: "+15550000000" },
      fakeClient,
    );

    await adapter.send({ to: "+237690000000", body: "Your code is 123456" });

    expect(create).toHaveBeenCalledWith({
      to: "+237690000000",
      from: "+15550000000",
      body: "Your code is 123456",
    });
  });
});
