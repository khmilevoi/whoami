import { describe, expect, it } from "vitest";
import { GameEngine } from "../../src/domain/game-engine";

const engine = new GameEngine();

describe("game engine", () => {
  it("rejects giveup outside IN_PROGRESS", () => {
    const game = engine.createGame({
      gameId: "g1",
      chatId: "c1",
      now: new Date().toISOString(),
      creator: {
        id: "p1",
        telegramUserId: "1",
        displayName: "P1",
      },
    });

    expect(() =>
      engine.giveUp(game, {
        playerId: "p1",
        now: new Date().toISOString(),
        turnRecordId: "t1",
      }),
    ).toThrowError();
  });
});
