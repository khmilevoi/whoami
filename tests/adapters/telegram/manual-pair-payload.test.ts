import { describe, expect, it } from "vitest";
import { InvalidManualPairPayloadError } from "../../../src/domain/errors";
import { parseManualPairPayload } from "../../../src/adapters/telegram/manual-pair-payload";

describe("parseManualPairPayload", () => {
  it("parses valid payload", () => {
    expect(parseManualPairPayload("pair:player-2:test-1")).toEqual({
      targetPlayerId: "player-2",
      gameId: "test-1",
    });
  });

  it("returns error for malformed payload", () => {
    expect(parseManualPairPayload("pair:test-1")).toBeInstanceOf(InvalidManualPairPayloadError);
    expect(parseManualPairPayload("vote:YES:test-1")).toBeInstanceOf(InvalidManualPairPayloadError);
  });
});
