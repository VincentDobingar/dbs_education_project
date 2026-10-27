import { describe, expect, it } from "vitest";

import {
  allocatePayment,
  applyDiscounts,
  buildSchedule,
  resolveInstallmentDates,
  selectFeeLines,
  splitByWeights,
  validatePlanShares,
  type FeeLine,
  type FeeStructureCandidate,
} from "./engine.js";

const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

function structure(
  partial: Partial<FeeStructureCandidate> & Pick<FeeStructureCandidate, "id">,
): FeeStructureCandidate {
  return {
    feeCategoryId: partial.id,
    categoryLabel: partial.id,
    nature: "TUITION",
    gradeLevelId: null,
    programId: null,
    studentType: "ALL",
    amountCents: 0,
    isMandatory: true,
    dueWithInstallment: null,
    ...partial,
  };
}

const line = (partial: Partial<FeeLine> & Pick<FeeLine, "label" | "nature" | "amountCents">): FeeLine => ({
  feeStructureId: partial.label,
  feeCategoryId: partial.label,
  isMandatory: true,
  dueWithInstallment: null,
  ...partial,
});

describe("selectFeeLines", () => {
  const structures = [
    structure({ id: "ins-all", feeCategoryId: "INS", nature: "REGISTRATION", amountCents: 2_500_000 }),
    structure({
      id: "ins-old",
      feeCategoryId: "INS",
      nature: "REGISTRATION",
      amountCents: 1_500_000,
      studentType: "RETURNING",
    }),
    structure({ id: "sco-all", feeCategoryId: "SCO", amountCents: 15_000_000 }),
    structure({ id: "sco-6e", feeCategoryId: "SCO", amountCents: 12_000_000, gradeLevelId: "6E" }),
    structure({
      id: "bac",
      feeCategoryId: "BAC",
      nature: "EXAM",
      amountCents: 2_500_000,
      gradeLevelId: "TLE",
    }),
    structure({
      id: "cantine",
      feeCategoryId: "CAN",
      nature: "ANNEX",
      amountCents: 3_000_000,
      isMandatory: false,
    }),
  ];

  it("picks the most specific tariff per category and the new / returning profile", () => {
    const fresh = selectFeeLines(structures, {
      gradeLevelId: "6E",
      programId: null,
      isReturning: false,
      optionalFeeStructureIds: [],
    });
    expect(fresh.map((l) => l.feeStructureId).sort()).toEqual(["ins-all", "sco-6e"]);
    const back = selectFeeLines(structures, {
      gradeLevelId: "TLE",
      programId: null,
      isReturning: true,
      optionalFeeStructureIds: [],
    });
    expect(back.map((l) => l.feeStructureId).sort()).toEqual(["bac", "ins-old", "sco-all"]);
  });

  it("adds an optional fee only when chosen", () => {
    const lines = selectFeeLines(structures, {
      gradeLevelId: "6E",
      programId: null,
      isReturning: false,
      optionalFeeStructureIds: ["cantine"],
    });
    expect(lines.map((l) => l.feeStructureId)).toContain("cantine");
  });
});

describe("plan rules", () => {
  it("validates shares", () => {
    expect(
      validatePlanShares([
        { sequence: 1, shareBps: 5000 },
        { sequence: 2, shareBps: 5000 },
      ]),
    ).toBeNull();
    expect(
      validatePlanShares([
        { sequence: 1, shareBps: 5000 },
        { sequence: 3, shareBps: 5000 },
      ]),
    ).toBe("PLAN_SEQUENCE_GAP");
    expect(
      validatePlanShares([
        { sequence: 1, shareBps: 6000 },
        { sequence: 2, shareBps: 5000 },
      ]),
    ).toBe("PLAN_SHARES_NOT_100");
  });

  it("anchors installments on the term start plus an offset", () => {
    const periods = new Map([["T2", d("2027-01-04")]]);
    const resolved = resolveInstallmentDates(
      [
        {
          sequence: 2,
          label: "Tranche 2",
          shareBps: 3000,
          anchorType: "PERIOD_START",
          academicPeriodId: "T2",
          offsetDays: 15,
          fixedDate: null,
        },
        {
          sequence: 1,
          label: "Tranche 1",
          shareBps: 7000,
          anchorType: "ENROLLMENT",
          academicPeriodId: null,
          offsetDays: 0,
          fixedDate: null,
        },
      ],
      periods,
      new Date("2026-10-05T14:30:00Z"),
    );
    expect(resolved.map((r) => r.dueDate.toISOString().slice(0, 10))).toEqual(["2026-10-05", "2027-01-19"]);
  });

  it("splits with the remainder on the last part", () => {
    expect(splitByWeights(100_001, [3333, 3333, 3334])).toEqual([33_330, 33_330, 33_341]);
    expect(splitByWeights(10, [])).toEqual([]);
  });

  it("caps discounts at the tuition amount", () => {
    const applied = applyDiscounts(10_000, [
      { label: "Fratrie", kind: "PERCENT", value: 1000 },
      { label: "Bourse", kind: "AMOUNT", value: 50_000 },
    ]);
    expect(applied.map((a) => a.amountCents)).toEqual([1000, 9000]);
  });
});

describe("buildSchedule", () => {
  const installments = [
    { sequence: 1, label: "Tranche 1", shareBps: 5000, dueDate: d("2026-10-01") },
    { sequence: 2, label: "Tranche 2", shareBps: 3000, dueDate: d("2027-01-15") },
    { sequence: 3, label: "Tranche 3", shareBps: 2000, dueDate: d("2027-04-15") },
  ];
  const lines = [
    line({ label: "Inscription", nature: "REGISTRATION", amountCents: 2_500_000 }),
    line({ label: "Scolarité", nature: "TUITION", amountCents: 15_000_000 }),
    line({ label: "Examen", nature: "EXAM", amountCents: 2_500_000, dueWithInstallment: 3 }),
  ];

  it("keeps registration apart and splits tuition by share, exam with its tranche", () => {
    const result = buildSchedule({
      lines,
      installments,
      discounts: [],
      enrollmentDate: d("2026-09-20"),
      midYearPolicy: "GROUP",
    });
    expect(result.dues.map((due) => [due.kind, due.sequence, due.totalCents])).toEqual([
      ["REGISTRATION", null, 2_500_000],
      ["INSTALLMENT", 1, 7_500_000],
      ["INSTALLMENT", 2, 4_500_000],
      ["INSTALLMENT", 3, 5_500_000],
    ]);
    expect(result.totalCents).toBe(20_000_000);
    expect(result.grossCents).toBe(20_000_000);
  });

  it("applies discounts to tuition only and shows them on each instalment", () => {
    const result = buildSchedule({
      lines,
      installments,
      discounts: [{ label: "Fratrie", kind: "PERCENT", value: 1000 }],
      enrollmentDate: d("2026-09-20"),
      midYearPolicy: "GROUP",
    });
    expect(result.discountCents).toBe(1_500_000);
    expect(result.totalCents).toBe(18_500_000);
    expect(result.dues[1]!.items[0]).toMatchObject({ amountCents: 7_500_000, discountCents: 750_000 });
    expect(result.dues.reduce((sum, due) => sum + due.totalCents, 0)).toBe(result.totalCents);
  });

  it("groups past instalments into one immediate due (GROUP)", () => {
    const result = buildSchedule({
      lines,
      installments,
      discounts: [],
      enrollmentDate: d("2027-02-01"),
      midYearPolicy: "GROUP",
    });
    const grouped = result.dues.find((due) => due.kind === "INSTALLMENT")!;
    expect(grouped.sequences).toEqual([1, 2]);
    expect(grouped.dueDate.toISOString().slice(0, 10)).toBe("2027-02-01");
    expect(grouped.totalCents).toBe(12_000_000);
    expect(result.totalCents).toBe(20_000_000);
  });

  it("bills only remaining periods (PRORATA)", () => {
    const result = buildSchedule({
      lines,
      installments,
      discounts: [],
      enrollmentDate: d("2027-02-01"),
      midYearPolicy: "PRORATA",
    });
    expect(result.skippedSequences).toEqual([1, 2]);
    const remaining = result.dues.filter((due) => due.kind === "INSTALLMENT");
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.totalCents).toBe(3_000_000 + 2_500_000);
  });

  it("falls back to one tuition due on the enrollment date without a plan", () => {
    const result = buildSchedule({
      lines: lines.slice(0, 2),
      installments: [],
      discounts: [],
      enrollmentDate: d("2026-09-20"),
      midYearPolicy: "GROUP",
    });
    expect(result.dues.map((due) => due.totalCents)).toEqual([2_500_000, 15_000_000]);
  });
});

describe("allocatePayment", () => {
  const invoices = [
    {
      id: "t2",
      kind: "INSTALLMENT" as const,
      outstandingCents: 4500,
      dueAt: d("2027-01-15"),
      createdAt: d("2026-09-01"),
    },
    {
      id: "t1",
      kind: "INSTALLMENT" as const,
      outstandingCents: 7500,
      dueAt: d("2026-10-01"),
      createdAt: d("2026-09-01"),
    },
    {
      id: "ins",
      kind: "REGISTRATION" as const,
      outstandingCents: 2500,
      dueAt: d("2026-09-20"),
      createdAt: d("2026-09-01"),
    },
    {
      id: "old",
      kind: "INSTALLMENT" as const,
      outstandingCents: 1000,
      dueAt: d("2026-04-15"),
      createdAt: d("2025-09-01"),
    },
  ];

  it("pays registration first, then the oldest dues, and keeps the leftover", () => {
    const { allocations, leftoverCents } = allocatePayment(20_000, invoices);
    expect(allocations).toEqual([
      { invoiceId: "ins", amountCents: 2500 },
      { invoiceId: "old", amountCents: 1000 },
      { invoiceId: "t1", amountCents: 7500 },
      { invoiceId: "t2", amountCents: 4500 },
    ]);
    expect(leftoverCents).toBe(4500);
  });

  it("stops when the amount runs out", () => {
    expect(allocatePayment(3000, invoices).allocations).toEqual([
      { invoiceId: "ins", amountCents: 2500 },
      { invoiceId: "old", amountCents: 500 },
    ]);
  });
});
