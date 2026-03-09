import { describe, expect, it } from "vitest";
import { computeMajorityDecision } from "../../src/domain/rules";

describe("voting", () => {
  it("uses YES on tie between YES and NO", () => {
    const result = computeMajorityDecision(["YES", "NO", "YES", "NO"]);
    expect(result).toBe("YES");
  });

  it("selects GUESSED when it has strict majority", () => {
    const result = computeMajorityDecision(["GUESSED", "GUESSED", "NO"]);
    expect(result).toBe("GUESSED");
  });
});
