import { describe, expect, it } from "vitest";
import { InvalidStartPayloadError } from "../../../src/domain/errors.js";
import { parseStartPayload } from "../../../src/adapters/telegram/start-payload.js";

describe("parseStartPayload", () => {
  it("returns null for missing payload", () => {
    expect(parseStartPayload(undefined)).toBeNull();
  });

  it("parses valid join and open payloads", () => {
    expect(parseStartPayload("join-test-1")).toEqual({
      action: "join",
      gameId: "test-1",
    });
    expect(parseStartPayload("open-room-42")).toEqual({
      action: "open",
      gameId: "room-42",
    });
  });

  it("returns error for malformed payload", () => {
    expect(parseStartPayload("join-")).toBeInstanceOf(InvalidStartPayloadError);
    expect(parseStartPayload("broken-test-1")).toBeInstanceOf(
      InvalidStartPayloadError,
    );
  });
});
