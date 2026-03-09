import { describe, expect, it } from "vitest";
import { buildRandomDerangement, validateManualPairChoice } from "../../src/domain/pairing";

describe("pairing", () => {
  it("builds derangement without self pair", () => {
    const ids = ["a", "b", "c", "d"];
    const result = buildRandomDerangement(ids);

    expect(Object.keys(result)).toHaveLength(ids.length);
    for (const id of ids) {
      expect(result[id]).toBeDefined();
      expect(result[id]).not.toBe(id);
    }

    const values = new Set(Object.values(result));
    expect(values.size).toBe(ids.length);
  });

  it("rejects manual self pair", () => {
    expect(() => validateManualPairChoice("a", "a", {}, ["a", "b"])).toThrowError();
  });
});
