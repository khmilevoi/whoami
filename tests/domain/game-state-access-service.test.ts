import { describe, expect, it } from "vitest";
import {
  PlayerNotFoundError,
  WordActionsNotAvailableInCurrentStageError,
  WordEntryForPlayerMissingError,
} from "../../src/domain/errors.js";
import { GameStateAccessService } from "../../src/domain/game-state-access/game-state-access-service.js";
import {
  createCircularPairings,
  createGameConfig,
  createGameState,
  createNormalWords,
} from "./service-test-helpers.js";

describe("game state access service", () => {
  it("returns an error when word actions are attempted outside the word stages", () => {
    const service = new GameStateAccessService();
    const game = createGameState({ stage: "LOBBY_OPEN" });

    expect(service.mustBeWordStage(game)).toBeInstanceOf(
      WordActionsNotAvailableInCurrentStageError,
    );
  });

  it("returns lookup errors for missing player, progress, and word entry", () => {
    const service = new GameStateAccessService();
    const game = createGameState();

    expect(service.mustGetPlayer(game, "missing-player")).toBeInstanceOf(
      PlayerNotFoundError,
    );
    expect(service.mustGetProgress(game, "missing-player")).toBeInstanceOf(
      PlayerNotFoundError,
    );
    expect(service.mustGetWordEntry(game, "missing-player")).toBeInstanceOf(
      WordEntryForPlayerMissingError,
    );
  });

  it("reports words as not ready when the number of entries does not match players", () => {
    const service = new GameStateAccessService();
    const game = createGameState({
      stage: "READY_WAIT",
      config: createGameConfig({ mode: "NORMAL", playMode: "ONLINE", pairingMode: "RANDOM" }),
    });

    game.words = {
      [game.players[0]!.id]: {
        ownerPlayerId: game.players[0]!.id,
        targetPlayerId: game.players[1]!.id,
        word: "alpha",
        clue: "one",
        wordConfirmed: true,
        finalConfirmed: true,
        solved: false,
      },
    };

    expect(service.allWordsReady(game)).toBe(false);
  });

  it("finishes the game by attaching a computed result", () => {
    const service = new GameStateAccessService();
    const playerIds = ["tg:1", "tg:2", "tg:3"];
    const pairings = createCircularPairings(playerIds);
    const game = createGameState({
      stage: "IN_PROGRESS",
      config: createGameConfig({ mode: "NORMAL", playMode: "ONLINE", pairingMode: "RANDOM" }),
      pairings,
      words: createNormalWords({ pairings, ready: true }),
      round: 2,
      turnOrder: playerIds,
    });

    game.progress["tg:1"]!.questionsAsked = 2;
    game.progress["tg:1"]!.roundsUsed = 1;
    game.progress["tg:2"]!.questionsAsked = 3;
    game.progress["tg:2"]!.roundsUsed = 2;
    game.progress["tg:3"]!.questionsAsked = 1;
    game.progress["tg:3"]!.roundsUsed = 1;

    service.finishGame(game, "2026-01-01T00:05:00.000Z");

    expect(game.stage).toBe("FINISHED");
    expect(game.result).toMatchObject({
      gameId: game.id,
      mode: "NORMAL",
      createdAt: "2026-01-01T00:05:00.000Z",
    });
    expect(game.result?.normal).toHaveLength(game.players.length);
  });
});
