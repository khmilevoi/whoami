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

  it("finishes normal game when last active player gives up", () => {
    const now = "2026-01-01T00:00:00.000Z";
    let game = engine.createGame({
      gameId: "g-last-giveup",
      chatId: "c-last-giveup",
      now,
      creator: {
        id: "p1",
        telegramUserId: "1",
        displayName: "P1",
      },
    });

    game = engine.joinGame(
      game,
      {
        id: "p2",
        telegramUserId: "2",
        displayName: "P2",
      },
      { minPlayers: 3, maxPlayers: 20 },
      "2026-01-01T00:01:00.000Z",
    );

    game = engine.joinGame(
      game,
      {
        id: "p3",
        telegramUserId: "3",
        displayName: "P3",
      },
      { minPlayers: 3, maxPlayers: 20 },
      "2026-01-01T00:02:00.000Z",
    );

    game = engine.closeLobby(game, "p1", { minPlayers: 3, maxPlayers: 20 }, "2026-01-01T00:03:00.000Z");
    game = engine.configureGame(
      game,
      {
        actorPlayerId: "p1",
        mode: "NORMAL",
        playMode: "ONLINE",
        pairingMode: "RANDOM",
      },
      "2026-01-01T00:04:00.000Z",
    );

    for (const player of game.players) {
      game = engine.submitWord(game, player.id, `word-${player.id}`, "2026-01-01T00:05:00.000Z");
      game = engine.confirmWord(game, player.id, true, "2026-01-01T00:06:00.000Z");
      game = engine.submitClue(game, player.id, undefined, "2026-01-01T00:07:00.000Z");
      game = engine.finalizeWord(game, player.id, true, "2026-01-01T00:08:00.000Z");
    }

    game = engine.startGameIfReady(game, "2026-01-01T00:09:00.000Z");

    game = engine.giveUp(game, {
      playerId: "p1",
      turnRecordId: "t1",
      now: "2026-01-01T00:10:00.000Z",
    });

    game = engine.giveUp(game, {
      playerId: "p2",
      turnRecordId: "t2",
      now: "2026-01-01T00:11:00.000Z",
    });

    game = engine.giveUp(game, {
      playerId: "p3",
      turnRecordId: "t3",
      now: "2026-01-01T00:12:00.000Z",
    });

    expect(game.stage).toBe("FINISHED");
    expect(game.result).toBeDefined();
  });
});
