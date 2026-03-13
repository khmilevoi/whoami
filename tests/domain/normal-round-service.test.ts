import { describe, expect, it } from "vitest";
import {
  ExpectedStageMismatchError,
  GameConfigurationMissingError,
  NotPlayersTurnError,
  PendingVoteMustBeResolvedFirstError,
  QuestionTextRequiredInOnlineModeError,
} from "../../src/domain/errors.js";
import { GameStateAccessService } from "../../src/domain/game-state-access/game-state-access-service.js";
import { NormalRoundService } from "../../src/domain/normal-round/normal-round-service.js";
import {
  createCircularPairings,
  createGameConfig,
  createGameState,
  createNormalWords,
} from "./service-test-helpers.js";

const createInProgressNormalGame = () => {
  const pairings = createCircularPairings(["tg:1", "tg:2", "tg:3"]);
  return createGameState({
    stage: "IN_PROGRESS",
    config: createGameConfig({ mode: "NORMAL", playMode: "ONLINE", pairingMode: "RANDOM" }),
    pairings,
    words: createNormalWords({ pairings, ready: true }),
    round: 1,
    turnOrder: ["tg:1", "tg:2", "tg:3"],
    turnCursor: 0,
  });
};

describe("normal round service", () => {
  it("rejects questions outside the in-progress stage", () => {
    const service = new NormalRoundService(new GameStateAccessService());
    const game = createInProgressNormalGame();
    game.stage = "READY_WAIT";

    expect(
      service.askQuestion(game, {
        actorPlayerId: "tg:1",
        questionText: "question",
        voteId: "vote-1",
        now: "2026-01-01T00:01:00.000Z",
      }),
    ).toBeInstanceOf(ExpectedStageMismatchError);
  });

  it("requires a configured game and a resolved pending vote before asking", () => {
    const service = new NormalRoundService(new GameStateAccessService());
    const missingConfig = createInProgressNormalGame();
    delete missingConfig.config;

    expect(
      service.askQuestion(missingConfig, {
        actorPlayerId: "tg:1",
        questionText: "question",
        voteId: "vote-1",
        now: "2026-01-01T00:01:00.000Z",
      }),
    ).toBeInstanceOf(GameConfigurationMissingError);

    const pendingVote = createInProgressNormalGame();
    pendingVote.inProgress.pendingVote = {
      id: "vote-open",
      gameId: pendingVote.id,
      round: 1,
      askerPlayerId: "tg:1",
      eligibleVoterIds: ["tg:2", "tg:3"],
      votes: {},
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    expect(
      service.askQuestion(pendingVote, {
        actorPlayerId: "tg:1",
        questionText: "another",
        voteId: "vote-2",
        now: "2026-01-01T00:02:00.000Z",
      }),
    ).toBeInstanceOf(PendingVoteMustBeResolvedFirstError);
  });

  it("requires text in online mode and enforces the current asker", () => {
    const service = new NormalRoundService(new GameStateAccessService());
    const game = createInProgressNormalGame();

    expect(
      service.askQuestion(game, {
        actorPlayerId: "tg:1",
        questionText: "   ",
        voteId: "vote-1",
        now: "2026-01-01T00:01:00.000Z",
      }),
    ).toBeInstanceOf(QuestionTextRequiredInOnlineModeError);

    expect(
      service.askQuestion(game, {
        actorPlayerId: "tg:2",
        questionText: "question",
        voteId: "vote-2",
        now: "2026-01-01T00:02:00.000Z",
      }),
    ).toBeInstanceOf(NotPlayersTurnError);
  });

  it("keeps duplicate votes idempotent", () => {
    const service = new NormalRoundService(new GameStateAccessService());
    const game = createInProgressNormalGame();
    game.inProgress.pendingVote = {
      id: "vote-1",
      gameId: game.id,
      round: 1,
      askerPlayerId: "tg:1",
      questionText: "question",
      eligibleVoterIds: ["tg:2", "tg:3"],
      votes: {},
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    service.castVote(game, {
      voterPlayerId: "tg:2",
      decision: "YES",
      voteRecordId: "record-1",
      turnRecordId: "turn-1",
      now: "2026-01-01T00:01:00.000Z",
    });
    service.castVote(game, {
      voterPlayerId: "tg:2",
      decision: "NO",
      voteRecordId: "record-2",
      turnRecordId: "turn-2",
      now: "2026-01-01T00:02:00.000Z",
    });

    expect(game.inProgress.pendingVote?.votes).toEqual({ "tg:2": "YES" });
    expect(game.voteHistory).toHaveLength(1);
  });

  it("marks the current asker as given up and advances the turn", () => {
    const service = new NormalRoundService(new GameStateAccessService());
    const game = createInProgressNormalGame();

    service.giveUp(game, {
      playerId: "tg:1",
      turnRecordId: "turn-giveup",
      now: "2026-01-01T00:01:00.000Z",
    });

    expect(game.players[0]).toMatchObject({ stage: "GAVE_UP" });
    expect(game.turns.at(-1)).toMatchObject({ askerPlayerId: "tg:1", outcome: "GIVEUP" });
    expect(game.inProgress.turnCursor).toBe(1);
  });

  it("finishes the game when the last active player gives up", () => {
    const service = new NormalRoundService(new GameStateAccessService());
    const game = createInProgressNormalGame();
    game.players[1]!.stage = "GUESSED";
    game.players[2]!.stage = "GAVE_UP";

    service.giveUp(game, {
      playerId: "tg:1",
      turnRecordId: "turn-final-giveup",
      now: "2026-01-01T00:01:00.000Z",
    });

    expect(game.stage).toBe("FINISHED");
    expect(game.result?.mode).toBe("NORMAL");
  });

  it("finishes the game when the final pending vote resolves to guessed", () => {
    const service = new NormalRoundService(new GameStateAccessService());
    const pairings = createCircularPairings(["tg:1", "tg:2"]);
    const game = createGameState({
      playerCount: 2,
      stage: "IN_PROGRESS",
      config: createGameConfig({ mode: "NORMAL", playMode: "ONLINE", pairingMode: "RANDOM" }),
      pairings,
      words: createNormalWords({ pairings, ready: true }),
      round: 2,
      turnOrder: ["tg:1", "tg:2"],
      turnCursor: 0,
    });
    game.players[1]!.stage = "GAVE_UP";
    game.inProgress.pendingVote = {
      id: "vote-final",
      gameId: game.id,
      round: 2,
      askerPlayerId: "tg:1",
      questionText: "question",
      eligibleVoterIds: ["tg:2"],
      votes: {},
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    service.castVote(game, {
      voterPlayerId: "tg:2",
      decision: "GUESSED",
      voteRecordId: "record-final",
      turnRecordId: "turn-final",
      now: "2026-01-01T00:03:00.000Z",
    });

    expect(game.players[0]).toMatchObject({ stage: "GUESSED" });
    expect(game.stage).toBe("FINISHED");
    expect(game.result?.mode).toBe("NORMAL");
  });

  it("skips terminal players and increments the round when the turn wraps", () => {
    const service = new NormalRoundService(new GameStateAccessService());
    const game = createInProgressNormalGame();
    game.players[0]!.stage = "GAVE_UP";
    game.players[2]!.stage = "GUESSED";
    game.inProgress.turnCursor = 2;

    service.askQuestion(game, {
      actorPlayerId: "tg:2",
      questionText: "wrapped-question",
      voteId: "vote-wrap",
      now: "2026-01-01T00:04:00.000Z",
    });

    expect(game.inProgress.turnCursor).toBe(1);
    expect(game.inProgress.round).toBe(2);
    expect(game.inProgress.pendingVote).toMatchObject({
      askerPlayerId: "tg:2",
      round: 1,
    });
  });
});



