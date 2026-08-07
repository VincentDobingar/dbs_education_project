import { describe, expect, it } from "vitest";

import { isTransitionAllowed } from "./subscription-transitions.js";

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
});
