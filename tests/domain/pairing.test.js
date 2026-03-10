"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const pairing_1 = require("../../src/domain/pairing");
(0, vitest_1.describe)("pairing", () => {
  (0, vitest_1.it)("builds derangement without self pair", () => {
    const ids = ["a", "b", "c", "d"];
    const result = (0, pairing_1.buildRandomDerangement)(ids);
    (0, vitest_1.expect)(Object.keys(result)).toHaveLength(ids.length);
    for (const id of ids) {
      (0, vitest_1.expect)(result[id]).toBeDefined();
      (0, vitest_1.expect)(result[id]).not.toBe(id);
    }
    const values = new Set(Object.values(result));
    (0, vitest_1.expect)(values.size).toBe(ids.length);
  });
  (0, vitest_1.it)("rejects manual self pair", () => {
    (0, vitest_1.expect)(() =>
      (0, pairing_1.validateManualPairChoice)("a", "a", {}, ["a", "b"]),
    ).toThrowError();
  });
});
