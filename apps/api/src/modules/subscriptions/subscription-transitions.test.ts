import { describe, expect, it } from "vitest";

import { computeGraceEnd, computePeriodEnd, isTransitionAllowed } from "./subscription-transitions.js";

describe("isTransitionAllowed", () => {
  it("allows the documented happy path", () => {
    expect(isTransitionAllowed("DRAFT", "PENDING_PAYMENT")).toBe(true);
    expect(isTransitionAllowed("PENDING_PAYMENT", "ACTIVE")).toBe(true);
    expect(isTransitionAllowed("ACTIVE", "PAST_DUE")).toBe(true);
    expect(isTransitionAllowed("PAST_DUE", "GRACE_PERIOD")).toBe(true);
    expect(isTransitionAllowed("GRACE_PERIOD", "ACTIVE")).toBe(true);
  });

  it("rejects skipping straight from DRAFT to ACTIVE", () => {
    expect(isTransitionAllowed("DRAFT", "ACTIVE")).toBe(false);
  });

  it("treats CANCELLED and REFUNDED as terminal", () => {
    expect(isTransitionAllowed("CANCELLED", "ACTIVE")).toBe(false);
    expect(isTransitionAllowed("CANCELLED", "DRAFT")).toBe(false);
    expect(isTransitionAllowed("REFUNDED", "ACTIVE")).toBe(false);
  });

  it("allows a lapsed subscription to be reactivated", () => {
    expect(isTransitionAllowed("EXPIRED", "ACTIVE")).toBe(true);
    expect(isTransitionAllowed("SUSPENDED", "ACTIVE")).toBe(true);
  });

  it("does not allow transitioning a status to itself", () => {
    expect(isTransitionAllowed("ACTIVE", "ACTIVE")).toBe(false);
  });

  it("allows a paid ACTIVE subscription to lapse straight into GRACE_PERIOD", () => {
    expect(isTransitionAllowed("ACTIVE", "GRACE_PERIOD")).toBe(true);
  });
});

describe("computePeriodEnd", () => {
  it("adds the number of months matching the billing period", () => {
    const from = new Date("2026-01-15T00:00:00.000Z");
    expect(computePeriodEnd(from, "MONTHLY")?.toISOString()).toBe("2026-02-15T00:00:00.000Z");
    expect(computePeriodEnd(from, "QUARTERLY")?.toISOString()).toBe("2026-04-15T00:00:00.000Z");
    expect(computePeriodEnd(from, "SEMIANNUAL")?.toISOString()).toBe("2026-07-15T00:00:00.000Z");
    expect(computePeriodEnd(from, "ANNUAL")?.toISOString()).toBe("2027-01-15T00:00:00.000Z");
    expect(computePeriodEnd(from, "SCHOOL_YEAR")?.toISOString()).toBe("2027-01-15T00:00:00.000Z");
  });

  it("returns null for CUSTOM, whose real duration is not tracked anywhere", () => {
    expect(computePeriodEnd(new Date(), "CUSTOM")).toBeNull();
  });
});

describe("computeGraceEnd", () => {
  it("adds the given number of days", () => {
    const from = new Date("2026-01-15T00:00:00.000Z");
    expect(computeGraceEnd(from, 15)?.toISOString()).toBe("2026-01-30T00:00:00.000Z");
  });

  it("returns null when the plan has no grace/trial period at all", () => {
    expect(computeGraceEnd(new Date(), 0)).toBeNull();
  });
});
