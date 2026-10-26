import { describe, expect, it } from "vitest";

import { splitAmount } from "./remedial-settlement.js";

describe("splitAmount", () => {
  it("répartit entre DBSA, l'établissement et l'enseignant, l'enseignant absorbant les arrondis", () => {
    expect(splitAmount(15_000, 2_000, 1_000)).toEqual({ PLATFORM: 1_500, SCHOOL: 3_000, TEACHER: 10_500 });
    expect(splitAmount(9_999, 1_500, 1_000)).toEqual({ PLATFORM: 999, SCHOOL: 1_499, TEACHER: 7_501 });
    const shares = splitAmount(12_345, 3_333, 777);
    expect(shares.PLATFORM + shares.SCHOOL + shares.TEACHER).toBe(12_345);
  });

  it("donne tout à l'enseignant sans part établissement ni commission", () => {
    expect(splitAmount(5_000, 0, 0)).toEqual({ PLATFORM: 0, SCHOOL: 0, TEACHER: 5_000 });
  });
});
