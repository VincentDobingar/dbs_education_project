import { inflateSync } from "node:zlib";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { generateReceiptPdf } from "../modules/finance/receipt-pdf.service.js";

const fixture = vi.hoisted(() => ({ refund: 0, long: false }));
vi.mock("../lib/pdf-letterhead.js", () => ({ fetchTenantLogo: vi.fn().mockResolvedValue(null) }));
vi.mock("../modules/students/student.service.js", () => ({
  getStudent: vi.fn(() =>
    Promise.resolve({
      id: "s",
      tenantId: "t",
      firstName: fixture.long ? "Prénom très long ".repeat(10) : "Sara",
      lastName: "Test",
      matricule: "TEST-1",
    }),
  ),
}));
vi.mock("../modules/finance/student-payment.service.js", () => ({
  requireReceipt: vi.fn(() =>
    Promise.resolve({
      number: "REC-TEST",
      issuedAt: new Date("2026-10-23"),
      refundedCents: fixture.refund,
      payment: {
        studentInvoiceId: "i",
        recordedByEmployeeId: "e",
        amountCents: 1000000,
        method: "CASH",
        paidAt: new Date("2026-10-23"),
      },
    }),
  ),
}));
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    studentInvoice: {
      findUnique: vi.fn().mockResolvedValue({ id: "i", studentId: "s", number: "INV-TEST" }),
    },
    tenant: { findUnique: vi.fn().mockResolvedValue({ currency: { isoCode: "XAF" } }) },
    employee: {
      findUnique: vi.fn(() =>
        Promise.resolve({
          tenantId: "t",
          firstName: fixture.long ? "Agent très long ".repeat(15) : "Agent",
          lastName: "Test",
        }),
      ),
    },
  },
}));
function pdfText(pdf: Buffer): string {
  return [...pdf.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .flatMap((match) => {
      let stream: Buffer;
      try {
        stream = inflateSync(Buffer.from(match[1]!, "latin1"));
      } catch {
        return [];
      }
      return [...stream.toString("latin1").matchAll(/<([a-f0-9]+)>/gi)].map((hex) =>
        Buffer.from(hex[1]!, "hex").toString("latin1"),
      );
    })
    .join("");
}
beforeEach(() => {
  fixture.refund = 0;
  fixture.long = false;
});
describe("reçu premium", () => {
  it("affiche le montant, la devise et les références sans page supplémentaire", async () => {
    const pdf = await generateReceiptPdf("r", { name: "École Test", logoUrl: null });
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
    const text = pdfText(pdf);
    expect(text).toContain("REC-TEST");
    expect(text).toContain("INV-TEST");
    expect(text).toContain("XAF");
    expect(text).not.toContain("REMBOURSÉ");
  });
  it.each([250000, 1000000])("préserve les mentions de remboursement (%i centimes)", async (refund) => {
    fixture.refund = refund;
    const pdf = await generateReceiptPdf("r", { name: "École Test", logoUrl: null });
    const text = pdfText(pdf);
    expect(text).toContain("Montant remboursé");
    expect(text).toContain("Montant net après remboursement");
    expect(text).toContain(refund === 1000000 ? "INTÉGRALEMENT REMBOURSÉ" : "PARTIELLEMENT REMBOURSÉ");
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
  });
  it("borne les noms longs pour conserver un reçu A5 lisible", async () => {
    fixture.long = true;
    const pdf = await generateReceiptPdf("r", {
      name: "Un établissement au nom particulièrement long ".repeat(3),
      logoUrl: null,
    });
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
    expect(pdfText(pdf)).toContain("XAF");
  });
});
