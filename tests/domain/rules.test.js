"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const rules_1 = require("../../src/domain/rules");
(0, vitest_1.describe)("voting", () => {
  (0, vitest_1.it)("uses YES on tie between YES and NO", () => {
    const result = (0, rules_1.computeMajorityDecision)([
      "YES",
      "NO",
      "YES",
      "NO",
    ]);
    (0, vitest_1.expect)(result).toBe("YES");
  });
  (0, vitest_1.it)("selects GUESSED when it has strict majority", () => {
    const result = (0, rules_1.computeMajorityDecision)([
      "GUESSED",
      "GUESSED",
      "NO",
    ]);
    (0, vitest_1.expect)(result).toBe("GUESSED");
  });
});
