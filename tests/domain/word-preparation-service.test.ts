import { describe, expect, it } from "vitest";
import {
  NotAllPlayersConfirmedWordsError,
  WordCannotBeEmptyError,
  WordMustBeConfirmedBeforeClueSubmissionError,
  WordMustBeConfirmedBeforeFinalizationError,
  WordMustBeSubmittedBeforeConfirmationError,
} from "../../src/domain/errors.js";
import { GameStateAccessService } from "../../src/domain/game-state-access/game-state-access-service.js";
import { WordPreparationService } from "../../src/domain/word-preparation/word-preparation-service.js";
import {
  createCircularPairings,
  createGameConfig,
  createGameState,
  createNormalWords,
  createReverseWords,
} from "./service-test-helpers.js";

describe("word preparation service", () => {
  it("rejects empty words without mutating the entry", () => {
    const service = new WordPreparationService(new GameStateAccessService());
    const pairings = createCircularPairings(["tg:1", "tg:2", "tg:3"]);
    const game = createGameState({
      stage: "PREPARE_WORDS",
      config: createGameConfig({ mode: "NORMAL", playMode: "ONLINE", pairingMode: "RANDOM" }),
      pairings,
      words: createNormalWords({ pairings }),
    });

    const result = service.submitWord(
      game,
      "tg:1",
      "   ",
      "2026-01-01T00:01:00.000Z",
    );

    expect(result).toBeInstanceOf(WordCannotBeEmptyError);
    expect(game.words["tg:1"]?.word).toBeUndefined();
  });

  it("requires a submitted word before confirmation", () => {
    const service = new WordPreparationService(new GameStateAccessService());
    const pairings = createCircularPairings(["tg:1", "tg:2", "tg:3"]);
    const game = createGameState({
      stage: "PREPARE_WORDS",
      config: createGameConfig({ mode: "NORMAL", playMode: "ONLINE", pairingMode: "RANDOM" }),
      pairings,
      words: createNormalWords({ pairings }),
    });

    expect(
      service.confirmWord(game, "tg:1", true, "2026-01-01T00:01:00.000Z"),
    ).toBeInstanceOf(WordMustBeSubmittedBeforeConfirmationError);
    expect(game.players[0]!.stage).toBe("JOINED");
  });

  it("requires a confirmed word before clue submission", () => {
    const service = new WordPreparationService(new GameStateAccessService());
    const pairings = createCircularPairings(["tg:1", "tg:2", "tg:3"]);
    const game = createGameState({
      stage: "PREPARE_WORDS",
      config: createGameConfig({ mode: "NORMAL", playMode: "ONLINE", pairingMode: "RANDOM" }),
      pairings,
      words: createNormalWords({ pairings }),
    });

    game.words["tg:1"]!.word = "alpha";

    expect(
      service.submitClue(game, "tg:1", "one", "2026-01-01T00:01:00.000Z"),
    ).toBeInstanceOf(WordMustBeConfirmedBeforeClueSubmissionError);
    expect(game.words["tg:1"]?.clue).toBeUndefined();
  });

  it("requires a confirmed word before finalization", () => {
    const service = new WordPreparationService(new GameStateAccessService());
    const pairings = createCircularPairings(["tg:1", "tg:2", "tg:3"]);
    const game = createGameState({
      stage: "PREPARE_WORDS",
      config: createGameConfig({ mode: "NORMAL", playMode: "ONLINE", pairingMode: "RANDOM" }),
      pairings,
      words: createNormalWords({ pairings }),
    });

    game.words["tg:1"]!.word = "alpha";

    expect(
      service.finalizeWord(game, "tg:1", true, "2026-01-01T00:01:00.000Z"),
    ).toBeInstanceOf(WordMustBeConfirmedBeforeFinalizationError);
    expect(game.players[0]!.stage).toBe("JOINED");
  });

  it("does not start from READY_WAIT until every player has confirmed their word", () => {
    const service = new WordPreparationService(new GameStateAccessService());
    const pairings = createCircularPairings(["tg:1", "tg:2", "tg:3"]);
    const words = createNormalWords({ pairings, ready: true });
    words["tg:3"]!.finalConfirmed = false;
    const game = createGameState({
      stage: "READY_WAIT",
      config: createGameConfig({ mode: "NORMAL", playMode: "ONLINE", pairingMode: "RANDOM" }),
      pairings,
      words,
    });

    expect(
      service.startGameIfReady(game, "2026-01-01T00:01:00.000Z"),
    ).toBeInstanceOf(NotAllPlayersConfirmedWordsError);
    expect(game.stage).toBe("READY_WAIT");
  });

  it("starts a normal game with the full player turn order and no target", () => {
    const service = new WordPreparationService(new GameStateAccessService());
    const playerIds = ["tg:1", "tg:2", "tg:3"];
    const pairings = createCircularPairings(playerIds);
    const game = createGameState({
      stage: "READY_WAIT",
      config: createGameConfig({ mode: "NORMAL", playMode: "ONLINE", pairingMode: "RANDOM" }),
      pairings,
      words: createNormalWords({ pairings, ready: true }),
    });

    service.startGameIfReady(game, "2026-01-01T00:01:00.000Z");

    expect(game.stage).toBe("IN_PROGRESS");
    expect(game.inProgress.round).toBe(1);
    expect(game.inProgress.turnOrder).toEqual(playerIds);
    expect(game.inProgress.currentTargetPlayerId).toBeUndefined();
  });

  it("starts a reverse game with the first player as target and the rest as guessers", () => {
    const service = new WordPreparationService(new GameStateAccessService());
    const playerIds = ["tg:1", "tg:2", "tg:3"];
    const game = createGameState({
      stage: "READY_WAIT",
      config: createGameConfig({ mode: "REVERSE", playMode: "OFFLINE" }),
      words: createReverseWords({ playerIds, ready: true }),
    });

    service.startGameIfReady(game, "2026-01-01T00:01:00.000Z");

    expect(game.stage).toBe("IN_PROGRESS");
    expect(game.inProgress.round).toBe(1);
    expect(game.inProgress.currentTargetPlayerId).toBe("tg:1");
    expect(game.inProgress.turnOrder).toEqual(["tg:2", "tg:3"]);
    expect(game.inProgress.turnCursor).toBe(0);
  });
});
