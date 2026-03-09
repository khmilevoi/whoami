import { describe, expect, it } from "vitest";
import { DomainError } from "../../../src/domain/errors";
import { parseManualPairPayload } from "../../../src/adapters/telegram/manual-pair-payload";

describe("manual pair payload parser", () => {
  it("parses target id with colon", () => {
    expect(parseManualPairPayload("pair:tg:2:test-1")).toEqual({
      targetPlayerId: "tg:2",
      gameId: "test-1",
    });
  });

  it("throws for malformed payload", () => {
    expect(() => parseManualPairPayload("pair:test-1")).toThrowError(DomainError);
    expect(() => parseManualPairPayload("vote:YES:test-1")).toThrowError(DomainError);
  });
});
