import { describe, expect, it, vi } from "vitest";

import { BREVO_SEND_URL, BrevoEmailAdapter } from "./brevo-adapter.js";

const config = { apiKey: "xkeysib-test", fromAddress: "noreply@edu.test", fromName: "EduManage Africa" };

describe("BrevoEmailAdapter", () => {
  it("envoie l'e-mail à l'API Brevo avec la clé et l'expéditeur configurés", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"messageId":"<1@brevo>"}', { status: 201 }));
    const adapter = new BrevoEmailAdapter(config, fetchImpl);

    await adapter.send({ to: "parent@example.test", subject: "Bonjour", text: "Corps" });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(BREVO_SEND_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["api-key"]).toBe("xkeysib-test");
    expect(JSON.parse(init.body as string)).toEqual({
      sender: { email: "noreply@edu.test", name: "EduManage Africa" },
      to: [{ email: "parent@example.test" }],
      subject: "Bonjour",
      textContent: "Corps",
    });
  });

  it("échoue avec le statut et le message de Brevo quand l'envoi est refusé", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('{"code":"unauthorized","message":"Key not found"}', { status: 401 }));
    const adapter = new BrevoEmailAdapter(config, fetchImpl);

    await expect(adapter.send({ to: "a@b.test", subject: "s", text: "t" })).rejects.toThrow(
      /Brevo API 401: .*Key not found/,
    );
  });
});
