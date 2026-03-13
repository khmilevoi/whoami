import { describe, expect, it } from "vitest";
import {
  ExpectedStageMismatchError,
  GameConfigurationMissingError,
  NotPlayersTurnError,
  PendingVoteMustBeResolvedFirstError,
  QuestionTextRequiredInOnlineModeError,
  ReverseModeTargetMissingError,
} from "../../src/domain/errors.js";
import { GameStateAccessService } from "../../src/domain/game-state-access/game-state-access-service.js";
import { ReverseRoundService } from "../../src/domain/reverse-round/reverse-round-service.js";
import {
  createGameConfig,
  createGameState,
  createReverseWords,
} from "./service-test-helpers.js";

const createInProgressReverseGame = () => {
  const playerIds = ["tg:1", "tg:2", "tg:3"];
  return createGameState({
    stage: "IN_PROGRESS",
    config: createGameConfig({ mode: "REVERSE", playMode: "ONLINE" }),
    words: createReverseWords({ playerIds, ready: true }),
    round: 1,
    turnOrder: ["tg:2", "tg:3"],
    turnCursor: 0,
    currentTargetPlayerId: "tg:1",
    targetCursor: 0,
  });
};

describe("reverse round service", () => {
  it("rejects questions outside the in-progress stage", () => {
    const service = new ReverseRoundService(new GameStateAccessService());
    const game = createInProgressReverseGame();
    game.stage = "READY_WAIT";

    expect(
      service.askQuestion(game, {
        actorPlayerId: "tg:2",
        questionText: "question",
        voteId: "vote-1",
        now: "2026-01-01T00:01:00.000Z",
      }),
    ).toBeInstanceOf(ExpectedStageMismatchError);
  });

  it("requires configuration, a target, and no pending vote before asking", () => {
    const service = new ReverseRoundService(new GameStateAccessService());
    const missingConfig = createInProgressReverseGame();
    delete missingConfig.config;

    expect(
      service.askQuestion(missingConfig, {
        actorPlayerId: "tg:2",
        questionText: "question",
        voteId: "vote-1",
        now: "2026-01-01T00:01:00.000Z",
      }),
    ).toBeInstanceOf(GameConfigurationMissingError);

    const missingTarget = createInProgressReverseGame();
    missingTarget.inProgress.currentTargetPlayerId = undefined;
    expect(
      service.askQuestion(missingTarget, {
        actorPlayerId: "tg:2",
        questionText: "question",
        voteId: "vote-2",
        now: "2026-01-01T00:02:00.000Z",
      }),
    ).toBeInstanceOf(ReverseModeTargetMissingError);

    const pendingVote = createInProgressReverseGame();
    pendingVote.inProgress.pendingVote = {
      id: "vote-open",
      gameId: pendingVote.id,
      round: 1,
      askerPlayerId: "tg:2",
      targetWordOwnerId: "tg:1",
      eligibleVoterIds: ["tg:1"],
      votes: {},
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(
      service.askQuestion(pendingVote, {
        actorPlayerId: "tg:2",
        questionText: "again",
        voteId: "vote-3",
        now: "2026-01-01T00:03:00.000Z",
      }),
    ).toBeInstanceOf(PendingVoteMustBeResolvedFirstError);
  });

  it("requires online text and enforces the current asker", () => {
    const service = new ReverseRoundService(new GameStateAccessService());
    const game = createInProgressReverseGame();

    expect(
      service.askQuestion(game, {
        actorPlayerId: "tg:2",
        questionText: "   ",
        voteId: "vote-1",
        now: "2026-01-01T00:01:00.000Z",
      }),
    ).toBeInstanceOf(QuestionTextRequiredInOnlineModeError);

    expect(
      service.askQuestion(game, {
        actorPlayerId: "tg:3",
        questionText: "question",
        voteId: "vote-2",
        now: "2026-01-01T00:02:00.000Z",
      }),
    ).toBeInstanceOf(NotPlayersTurnError);
  });

  it("keeps duplicate reverse votes idempotent", () => {
    const service = new ReverseRoundService(new GameStateAccessService());
    const game = createInProgressReverseGame();
    game.inProgress.pendingVote = {
      id: "vote-1",
      gameId: game.id,
      round: 1,
      askerPlayerId: "tg:2",
      targetWordOwnerId: "tg:1",
      questionText: "question",
      eligibleVoterIds: ["tg:1"],
      votes: {},
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    service.castVote(game, {
      voterPlayerId: "tg:1",
      decision: "YES",
      voteRecordId: "record-1",
      turnRecordId: "turn-1",
      now: "2026-01-01T00:01:00.000Z",
    });
    game.inProgress.pendingVote = {
      id: "vote-2",
      gameId: game.id,
      round: 1,
      askerPlayerId: "tg:2",
      targetWordOwnerId: "tg:1",
      questionText: "question",
      eligibleVoterIds: ["tg:1"],
      votes: { "tg:1": "YES" },
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    service.castVote(game, {
      voterPlayerId: "tg:1",
      decision: "NO",
      voteRecordId: "record-2",
      turnRecordId: "turn-2",
      now: "2026-01-01T00:02:00.000Z",
    });

    expect(game.inProgress.pendingVote?.votes).toEqual({ "tg:1": "YES" });
    expect(game.voteHistory).toHaveLength(1);
  });

  it("treats a give-up from the current target as a no-op", () => {
    const service = new ReverseRoundService(new GameStateAccessService());
    const game = createInProgressReverseGame();

    service.giveUp(game, {
      playerId: "tg:1",
      turnRecordId: "turn-target-noop",
      now: "2026-01-01T00:01:00.000Z",
    });

    expect(game.turns).toEqual([]);
    expect(game.progress["tg:1"]?.reverseGiveUpsByTarget).toEqual([]);
  });

  it("keeps repeated give-up requests for the same target idempotent", () => {
    const service = new ReverseRoundService(new GameStateAccessService());
    const game = createInProgressReverseGame();
    game.progress["tg:2"]!.reverseGiveUpsByTarget = ["tg:1"];

    service.giveUp(game, {
      playerId: "tg:2",
      turnRecordId: "turn-repeat-giveup",
      now: "2026-01-01T00:01:00.000Z",
    });

    expect(game.turns).toEqual([]);
    expect(game.progress["tg:2"]?.reverseGiveUpsByTarget).toEqual(["tg:1"]);
  });

  it("marks a guessed target as solved and advances to the next target", () => {
    const service = new ReverseRoundService(new GameStateAccessService());
    const game = createInProgressReverseGame();
    game.inProgress.pendingVote = {
      id: "vote-guessed",
      gameId: game.id,
      round: 1,
      askerPlayerId: "tg:2",
      targetWordOwnerId: "tg:1",
      questionText: "question",
      eligibleVoterIds: ["tg:1"],
      votes: {},
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    service.castVote(game, {
      voterPlayerId: "tg:1",
      decision: "GUESSED",
      voteRecordId: "record-guessed",
      turnRecordId: "turn-guessed",
      now: "2026-01-01T00:02:00.000Z",
    });

    expect(game.words["tg:1"]?.solved).toBe(true);
    expect(game.inProgress.currentTargetPlayerId).toBe("tg:2");
  });

  it("auto-solves the last target when no guessers remain and finishes the game", () => {
    const service = new ReverseRoundService(new GameStateAccessService());
    const game = createGameState({
      playerCount: 2,
      stage: "IN_PROGRESS",
      config: createGameConfig({ mode: "REVERSE", playMode: "ONLINE" }),
      words: createReverseWords({ playerIds: ["tg:1", "tg:2"], ready: true, solvedIds: ["tg:2"] }),
      round: 2,
      turnOrder: ["tg:2"],
      turnCursor: 0,
      currentTargetPlayerId: "tg:1",
      targetCursor: 0,
    });

    service.giveUp(game, {
      playerId: "tg:2",
      turnRecordId: "turn-last-giveup",
      now: "2026-01-01T00:03:00.000Z",
    });

    expect(game.words["tg:1"]?.solved).toBe(true);
    expect(game.stage).toBe("FINISHED");
    expect(game.result?.mode).toBe("REVERSE");
  });

  it("defaults malformed reverse votes to NO when the target vote is missing", () => {
    const service = new ReverseRoundService(new GameStateAccessService());
    const game = createInProgressReverseGame();
    game.inProgress.pendingVote = {
      id: "vote-malformed",
      gameId: game.id,
      round: 1,
      askerPlayerId: "tg:2",
      targetWordOwnerId: "tg:1",
      questionText: "question",
      eligibleVoterIds: ["tg:3"],
      votes: {},
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    service.castVote(game, {
      voterPlayerId: "tg:3",
      decision: "YES",
      voteRecordId: "record-malformed",
      turnRecordId: "turn-malformed",
      now: "2026-01-01T00:04:00.000Z",
    });

    expect(game.turns.at(-1)).toMatchObject({ outcome: "NO", askerPlayerId: "tg:2" });
    expect(game.inProgress.turnOrder[game.inProgress.turnCursor]).toBe("tg:3");
    expect(game.words["tg:1"]?.solved).toBe(false);
  });
});

