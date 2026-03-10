import { describe, expect, it } from "vitest";
import { PlayerCannotPairWithSelfError } from "../../src/domain/errors.js";
import {
  buildRandomDerangement,
  validateManualPairChoice,
} from "../../src/domain/pairing.js";

describe("pairing", () => {
  it("builds derangement without self pair", () => {
    const ids = ["a", "b", "c", "d"];
    const result = buildRandomDerangement(ids);

    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) {
      return;
    }

    expect(Object.keys(result)).toHaveLength(ids.length);
    for (const id of ids) {
      expect(result[id]).toBeDefined();
      expect(result[id]).not.toBe(id);
    }

    const values = new Set(Object.values(result));
    expect(values.size).toBe(ids.length);
  });

  it("returns error for manual self pair", () => {
    expect(validateManualPairChoice("a", "a", {}, ["a", "b"])).toBeInstanceOf(
      PlayerCannotPairWithSelfError,
    );
  });
});
