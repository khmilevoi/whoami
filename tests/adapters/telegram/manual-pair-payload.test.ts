import { describe, expect, it } from "vitest";
import { InvalidManualPairPayloadError } from "../../../src/domain/errors.js";
import { parseManualPairPayload } from "../../../src/adapters/telegram/manual-pair-payload.js";

describe("parseManualPairPayload", () => {
  it("parses valid payload", () => {
    expect(parseManualPairPayload("pair:player-2:test-1")).toEqual({
      targetPlayerId: "player-2",
      gameId: "test-1",
    });
  });

  it("parses payload when targetPlayerId contains colons", () => {
    expect(parseManualPairPayload("pair:tg:397622509:test-1")).toEqual({
      targetPlayerId: "tg:397622509",
      gameId: "test-1",
    });
    expect(parseManualPairPayload("pair:foo:bar:baz:test-2")).toEqual({
      targetPlayerId: "foo:bar:baz",
      gameId: "test-2",
    });
  });

  it("returns error for malformed payload", () => {
    expect(parseManualPairPayload("pair:test-1")).toBeInstanceOf(
      InvalidManualPairPayloadError,
    );
    expect(parseManualPairPayload("pair::test-1")).toBeInstanceOf(
      InvalidManualPairPayloadError,
    );
    expect(parseManualPairPayload("pair:player-2:")).toBeInstanceOf(
      InvalidManualPairPayloadError,
    );
    expect(parseManualPairPayload("vote:YES:test-1")).toBeInstanceOf(
      InvalidManualPairPayloadError,
    );
  });
});
