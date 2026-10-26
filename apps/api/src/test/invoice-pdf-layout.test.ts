import { describe, expect, it, vi } from "vitest";

import { generateInvoicePdf } from "../modules/finance/invoice-pdf.service.js";
const fixture = vi.hoisted(() => ({ count: 1 }));
vi.mock("../modules/finance/student-invoice.service.js", () => ({
  requireStudentInvoice: vi.fn(() => ({
    id: "i",
    studentId: "s",
    academicYearId: "y",
    number: "INV-TEST",
    status: "ISSUED",
    totalCents: 1000000,
    paidCents: 500000,
    issuedAt: new Date(),
    dueAt: null,
    items: Array.from({ length: fixture.count }, (_, i) => ({
      description: "Frais scolaires " + i,
      amountCents: 1000000,
      discountCents: 0,
    })),
  })),
}));
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    tenant: { findUnique: vi.fn(() => ({ currency: { isoCode: "XAF" } })) },
    academicYear: { findUnique: vi.fn(() => ({ name: "2026-2027" })) },
  },
}));
vi.mock("../modules/students/student.service.js", () => ({
  getStudent: vi.fn(() => ({ tenantId: "t", firstName: "Sara", lastName: "Test", matricule: "MAT-TEST" })),
}));
vi.mock("../lib/pdf-letterhead.js", () => ({ fetchTenantLogo: vi.fn(() => null) }));
describe("facture premium", () => {
  it("produit une page pour une facture simple", async () => {
    fixture.count = 1;
    const pdf = await generateInvoicePdf("i", { name: "École Test", logoUrl: null });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(1);
  });
  it("pagine les factures comprenant de nombreuses lignes", async () => {
    fixture.count = 40;
    const pdf = await generateInvoicePdf("i", { name: "École Test", logoUrl: null });
    expect((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });
});
