import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { KONOOM_SIGNATURE_HEADER, KonoomPaymentAdapter } from "./konoom-provider.js";

const config = {
  baseUrl: "https://api.konoom.test/",
  apiKey: "kk_test",
  merchantId: "DBSA-001",
  webhookSecret: "whsec_test",
  callbackUrl: "https://api.edu.test/api/v1/payments/webhooks/KONOOM_TD",
};

describe("KonoomPaymentAdapter", () => {
  it("demande l'encaissement au wallet du payeur avec la référence de l'intention", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ transaction_id: "KNM-1", message: "Validez sur votre téléphone" }), {
        status: 202,
      }),
    );
    const adapter = new KonoomPaymentAdapter("KONOOM_TD", config, fetchImpl);

    const result = await adapter.initiatePayment({
      merchantReference: "RC-ABC-123",
      amountCents: 15_000,
      currencyIsoCode: "XAF",
      currencyDecimalDigits: 0,
      customerPhone: "+23566000000",
      description: "Cours de renforcement",
    });

    expect(result).toEqual({ externalReference: "KNM-1", customerMessage: "Validez sur votre téléphone" });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.konoom.test/v1/collections");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer kk_test");
    expect(JSON.parse(init.body as string)).toMatchObject({
      merchant_id: "DBSA-001",
      reference: "RC-ABC-123",
      amount: 15_000,
      currency: "XAF",
      msisdn: "+23566000000",
      callback_url: config.callbackUrl,
    });
  });

  it("refuse une réponse en erreur de l'opérateur", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("insufficient balance", { status: 402 }));
    const adapter = new KonoomPaymentAdapter("KONOOM_TD", config, fetchImpl);
    await expect(
      adapter.initiatePayment({
        merchantReference: "R",
        amountCents: 1,
        currencyIsoCode: "XAF",
        currencyDecimalDigits: 0,
        customerPhone: "+23500000000",
        description: "x",
      }),
    ).rejects.toThrow(/Konoom 402/);
  });

  it("vérifie la signature HMAC du webhook et normalise l'événement", () => {
    const adapter = new KonoomPaymentAdapter("KONOOM_TD", config);
    const body = JSON.stringify({
      event_id: "evt-1",
      transaction_id: "KNM-1",
      reference: "RC-ABC-123",
      status: "success",
      amount: 15_000,
    });
    const signature = createHmac("sha256", config.webhookSecret).update(body).digest("hex");

    expect(
      adapter.verifyWebhookSignature({ rawBody: body, headers: { [KONOOM_SIGNATURE_HEADER]: signature } }),
    ).toBe(true);
    expect(
      adapter.verifyWebhookSignature({
        rawBody: body,
        headers: { [KONOOM_SIGNATURE_HEADER]: `sha256=${signature}` },
      }),
    ).toBe(true);
    expect(
      adapter.verifyWebhookSignature({
        rawBody: `${body} `,
        headers: { [KONOOM_SIGNATURE_HEADER]: signature },
      }),
    ).toBe(false);
    expect(adapter.verifyWebhookSignature({ rawBody: body, headers: {} })).toBe(false);

    expect(adapter.parseWebhookEvent(body)).toEqual({
      externalEventId: "evt-1",
      externalReference: "KNM-1",
      merchantReference: "RC-ABC-123",
      status: "SUCCEEDED",
      amountCents: 15_000,
    });
    expect(() => adapter.parseWebhookEvent(JSON.stringify({ status: "weird" }))).toThrow(/Unrecognized/);
  });
});
