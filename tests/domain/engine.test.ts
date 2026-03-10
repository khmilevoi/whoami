import { describe, expect, it } from "vitest";
import { GameEngine } from "../../src/domain/game-engine.js";
import {
  ExpectedStageMismatchError,
  GameEngineError,
  JoinAllowedOnlyWhenLobbyOpenError,
  MaxPlayersReachedError,
  NotPlayersTurnToPickPairError,
  OnlyGameCreatorCanCloseLobbyError,
  PlayerCannotPairWithSelfError,
  PlayerNotAllowedToVoteError,
  SelectedTargetIsAlreadyTakenError,
  WordMustBeConfirmedBeforeClueSubmissionError,
} from "../../src/domain/errors.js";
import {
  GameMode,
  GameState,
  PairingMode,
  PlayMode,
} from "../../src/domain/types.js";
import { mustBeDefined } from "../support/strict-helpers.js";

const engine = new GameEngine();

const unwrap = <T>(result: T): Exclude<T, GameEngineError> => {
  expect(result).not.toBeInstanceOf(Error);
  return result as Exclude<T, GameEngineError>;
};

const createClock = () => {
  let step = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, step++)).toISOString();
};

const createPlayer = (index: number) => ({
  id: `p${index}`,
  telegramUserId: `${index}`,
  displayName: `Player ${index}`,
});

const setupConfiguredGame = ({
  playerCount = 3,
  mode = "NORMAL",
  playMode = "ONLINE",
  pairingMode = "RANDOM",
}: {
  playerCount?: number;
  mode?: GameMode;
  playMode?: PlayMode;
  pairingMode?: PairingMode;
}) => {
  const now = createClock();
  const limits = { minPlayers: Math.min(playerCount, 2), maxPlayers: 20 };
  const players = Array.from({ length: playerCount }, (_, index) =>
    createPlayer(index + 1),
  );

  let game: GameState = engine.createGame({
    gameId: "game-1",
    chatId: "chat-1",
    creator: players[0]!,
    now: now(),
  });

  for (const player of players.slice(1)) {
    game = unwrap(engine.joinGame(game, player, limits, now()));
  }

  game = unwrap(engine.closeLobby(game, players[0]!.id, limits, now()));
  game = unwrap(
    engine.configureGame(
      game,
      {
        actorPlayerId: players[0]!.id,
        mode,
        playMode,
        pairingMode: mode === "NORMAL" ? pairingMode : undefined,
      },
      now(),
    ),
  );

  return { game, players, now };
};

const prepareAllWords = ({
  game,
  players,
  now,
}: {
  game: GameState;
  players: Array<{ id: string }>;
  now: () => string;
}) => {
  let next = game;

  for (const player of players) {
    next = unwrap(engine.submitWord(next, player.id, `word-${player.id}`, now()));
    next = unwrap(engine.confirmWord(next, player.id, true, now()));
    next = unwrap(engine.submitClue(next, player.id, undefined, now()));
    next = unwrap(engine.finalizeWord(next, player.id, true, now()));
  }

  return next;
};

describe("game engine", () => {
  it("manages lobby lifecycle, duplicate join, and player limits through state transitions", () => {
    const now = createClock();
    const creator = createPlayer(1);
    const second = createPlayer(2);
    const third = createPlayer(3);
    const limits = { minPlayers: 2, maxPlayers: 2 };

    let game = engine.createGame({
      gameId: "lobby-game",
      chatId: "lobby-chat",
      creator,
      now: now(),
    });

    game = unwrap(engine.joinGame(game, second, limits, now()));
    const duplicateJoin = unwrap(engine.joinGame(game, second, limits, now()));
    expect(duplicateJoin.players.map((player) => player.id)).toEqual(["p1", "p2"]);

    expect(engine.joinGame(game, third, limits, now())).toBeInstanceOf(
      MaxPlayersReachedError,
    );
    expect(engine.closeLobby(game, second.id, limits, now())).toBeInstanceOf(
      OnlyGameCreatorCanCloseLobbyError,
    );

    game = unwrap(engine.closeLobby(game, creator.id, limits, now()));
    expect(game.stage).toBe("CONFIGURING");
    expect(engine.joinGame(game, third, limits, now())).toBeInstanceOf(
      JoinAllowedOnlyWhenLobbyOpenError,
    );
  });

  it("configures NORMAL random mode with deranged pairings and initialized words", () => {
    const { game, players } = setupConfiguredGame({
      playerCount: 4,
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
    });

    expect(game.stage).toBe("PREPARE_WORDS");
    expect(game.config).toEqual({
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
    });
    expect(Object.keys(game.pairings)).toHaveLength(players.length);
    expect(Object.keys(game.words)).toHaveLength(players.length);

    for (const player of players) {
      expect(game.pairings[player.id]).toBeDefined();
      expect(game.pairings[player.id]).not.toBe(player.id);
      expect(game.words[player.id]).toMatchObject({
        ownerPlayerId: player.id,
        targetPlayerId: game.pairings[player.id],
        wordConfirmed: false,
        finalConfirmed: false,
        solved: false,
      });
      expect(
        game.players.find((candidate) => candidate.id === player.id)?.stage,
      ).toBe("WORD_DRAFT");
    }
  });

  it("configures NORMAL manual mode, enforces chooser order, and initializes words only after the last pair", () => {
    const setup = setupConfiguredGame({
      playerCount: 4,
      mode: "NORMAL",
      playMode: "OFFLINE",
      pairingMode: "MANUAL",
    });
    const { game: initialGame, players, now } = setup;
    let game = initialGame;

    expect(game.preparation.manualPairingQueue).toEqual(players.map((player) => player.id));
    expect(game.preparation.manualPairingCursor).toBe(0);
    expect(game.words).toEqual({});

    expect(
      engine.selectManualPair(game, players[1]!.id, players[2]!.id, now()),
    ).toBeInstanceOf(NotPlayersTurnToPickPairError);
    expect(
      engine.selectManualPair(game, players[0]!.id, players[0]!.id, now()),
    ).toBeInstanceOf(PlayerCannotPairWithSelfError);

    game = unwrap(
      engine.selectManualPair(game, players[0]!.id, players[1]!.id, now()),
    );
    expect(game.pairings).toEqual({ [players[0]!.id]: players[1]!.id });
    expect(game.words).toEqual({});

    expect(
      engine.selectManualPair(game, players[1]!.id, players[1]!.id, now()),
    ).toBeInstanceOf(PlayerCannotPairWithSelfError);

    game = unwrap(
      engine.selectManualPair(game, players[1]!.id, players[2]!.id, now()),
    );
    expect(game.preparation.manualPairingCursor).toBe(2);
    expect(game.words).toEqual({});

    expect(
      engine.selectManualPair(game, players[2]!.id, players[1]!.id, now()),
    ).toBeInstanceOf(SelectedTargetIsAlreadyTakenError);

    game = unwrap(
      engine.selectManualPair(game, players[2]!.id, players[3]!.id, now()),
    );
    game = unwrap(
      engine.selectManualPair(game, players[3]!.id, players[0]!.id, now()),
    );

    expect(game.preparation.manualPairingCursor).toBe(players.length);
    expect(game.pairings).toEqual({
      [players[0]!.id]: players[1]!.id,
      [players[1]!.id]: players[2]!.id,
      [players[2]!.id]: players[3]!.id,
      [players[3]!.id]: players[0]!.id,
    });
    expect(Object.keys(game.words)).toHaveLength(players.length);
  });

  it("tracks word confirmation, clue entry, and final restart before reaching READY_WAIT", () => {
    const setup = setupConfiguredGame({
      playerCount: 3,
      mode: "REVERSE",
      playMode: "ONLINE",
    });
    const { players, now } = setup;
    let game = setup.game;
    const actor = players[0]!;

    game = unwrap(engine.submitWord(game, actor.id, "planet", now()));
    expect(game.words[actor.id]?.word).toBe("planet");

    game = unwrap(engine.confirmWord(game, actor.id, false, now()));
    expect(game.words[actor.id]?.word).toBeUndefined();
    expect(game.words[actor.id]?.clue).toBeUndefined();
    expect(game.words[actor.id]?.wordConfirmed).toBe(false);
    expect(game.words[actor.id]?.finalConfirmed).toBe(false);

    game = unwrap(engine.submitWord(game, actor.id, "mars", now()));
    expect(engine.submitClue(game, actor.id, "red", now())).toBeInstanceOf(
      WordMustBeConfirmedBeforeClueSubmissionError,
    );

    game = unwrap(engine.confirmWord(game, actor.id, true, now()));
    expect(game.players.find((player) => player.id === actor.id)?.stage).toBe(
      "WORD_CONFIRMED",
    );

    game = unwrap(engine.submitClue(game, actor.id, "red world", now()));
    expect(game.words[actor.id]?.clue).toBe("red world");

    game = unwrap(engine.finalizeWord(game, actor.id, false, now()));
    expect(game.words[actor.id]?.word).toBeUndefined();
    expect(game.words[actor.id]?.clue).toBeUndefined();
    expect(game.words[actor.id]?.wordConfirmed).toBe(false);
    expect(game.words[actor.id]?.finalConfirmed).toBe(false);
    expect(game.players.find((player) => player.id === actor.id)?.stage).toBe(
      "WORD_DRAFT",
    );

    game = unwrap(engine.submitWord(game, actor.id, "venus", now()));
    game = unwrap(engine.confirmWord(game, actor.id, true, now()));
    game = unwrap(engine.submitClue(game, actor.id, undefined, now()));
    game = unwrap(engine.finalizeWord(game, actor.id, true, now()));

    for (const player of players.slice(1)) {
      game = unwrap(engine.submitWord(game, player.id, `word-${player.id}`, now()));
      game = unwrap(engine.confirmWord(game, player.id, true, now()));
      game = unwrap(engine.submitClue(game, player.id, undefined, now()));
      game = unwrap(engine.finalizeWord(game, player.id, true, now()));
    }

    expect(game.stage).toBe("READY_WAIT");
    expect(Object.values(game.words).every((entry) => entry.finalConfirmed)).toBe(true);
  });

  it("resolves NORMAL votes through YES, GUESSED, and GIVEUP while building final stats", () => {
    const setup = setupConfiguredGame({
      playerCount: 3,
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
    });
    const { players, now } = setup;
    let game = prepareAllWords({ game: setup.game, players, now });
    game = unwrap(engine.startGameIfReady(game, now()));

    const firstAskerId = mustBeDefined(
      game.inProgress.turnOrder[game.inProgress.turnCursor],
      "Expected first asker",
    );
    const firstEligible = game.players
      .filter((player) => player.id !== firstAskerId)
      .map((player) => player.id);

    game = unwrap(
      engine.askQuestion(game, {
        actorPlayerId: firstAskerId,
        questionText: "question-1",
        voteId: "vote-1",
        now: now(),
      }),
    );
    expect(game.inProgress.pendingVote?.eligibleVoterIds).toEqual(firstEligible);

    game = unwrap(
      engine.castVote(game, {
        voterPlayerId: firstEligible[0]!,
        decision: "YES",
        voteRecordId: "record-1",
        turnRecordId: "turn-1",
        now: now(),
      }),
    );
    game = unwrap(
      engine.castVote(game, {
        voterPlayerId: firstEligible[1]!,
        decision: "NO",
        voteRecordId: "record-2",
        turnRecordId: "turn-1",
        now: now(),
      }),
    );

    expect(game.turns[0]).toMatchObject({
      askerPlayerId: firstAskerId,
      outcome: "YES",
      questionText: "question-1",
    });
    expect(game.inProgress.turnOrder[game.inProgress.turnCursor]).toBe(firstAskerId);
    expect(game.voteHistory).toHaveLength(2);
    expect(game.progress[firstAskerId]?.questionsAsked).toBe(1);

    game = unwrap(
      engine.askQuestion(game, {
        actorPlayerId: firstAskerId,
        questionText: "question-2",
        voteId: "vote-2",
        now: now(),
      }),
    );
    game = unwrap(
      engine.castVote(game, {
        voterPlayerId: firstEligible[0]!,
        decision: "GUESSED",
        voteRecordId: "record-3",
        turnRecordId: "turn-2",
        now: now(),
      }),
    );
    game = unwrap(
      engine.castVote(game, {
        voterPlayerId: firstEligible[1]!,
        decision: "GUESSED",
        voteRecordId: "record-4",
        turnRecordId: "turn-2",
        now: now(),
      }),
    );

    expect(game.players.find((player) => player.id === firstAskerId)?.stage).toBe(
      "GUESSED",
    );
    expect(game.progress[firstAskerId]).toMatchObject({
      guessedAtRound: 1,
      roundsUsed: 1,
      questionsAsked: 2,
    });

    const secondAskerId = mustBeDefined(
      game.inProgress.turnOrder[game.inProgress.turnCursor],
      "Expected second asker",
    );
    expect(secondAskerId).not.toBe(firstAskerId);

    game = unwrap(
      engine.askQuestion(game, {
        actorPlayerId: secondAskerId,
        questionText: "question-3",
        voteId: "vote-3",
        now: now(),
      }),
    );
    expect(game.inProgress.pendingVote?.eligibleVoterIds).toContain(firstAskerId);

    expect(
      engine.castVote(game, {
        voterPlayerId: secondAskerId,
        decision: "NO",
        voteRecordId: "record-invalid",
        turnRecordId: "turn-invalid",
        now: now(),
      }),
    ).toBeInstanceOf(PlayerNotAllowedToVoteError);

    const pendingEligible = [...(game.inProgress.pendingVote?.eligibleVoterIds ?? [])];
    game = unwrap(
      engine.castVote(game, {
        voterPlayerId: pendingEligible[0]!,
        decision: "NO",
        voteRecordId: "record-5",
        turnRecordId: "turn-3",
        now: now(),
      }),
    );
    game = unwrap(
      engine.castVote(game, {
        voterPlayerId: pendingEligible[1]!,
        decision: "NO",
        voteRecordId: "record-6",
        turnRecordId: "turn-3",
        now: now(),
      }),
    );

    const thirdAskerId = mustBeDefined(
      game.inProgress.turnOrder[game.inProgress.turnCursor],
      "Expected third asker",
    );

    game = unwrap(
      engine.giveUp(game, {
        playerId: secondAskerId,
        turnRecordId: "turn-4",
        now: now(),
      }),
    );
    game = unwrap(
      engine.giveUp(game, {
        playerId: thirdAskerId,
        turnRecordId: "turn-5",
        now: now(),
      }),
    );

    expect(game.stage).toBe("FINISHED");
    expect(game.result?.mode).toBe("NORMAL");
    expect(game.turns.map((turn) => turn.outcome)).toEqual([
      "YES",
      "GUESSED",
      "NO",
      "GIVEUP",
      "GIVEUP",
    ]);
    expect(game.result?.normal).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ playerId: firstAskerId, rounds: 1, questions: 2 }),
        expect.objectContaining({ playerId: secondAskerId, rounds: 1 }),
        expect.objectContaining({ playerId: thirdAskerId }),
      ]),
    );
  });

  it("returns an error for give up outside IN_PROGRESS", () => {
    const now = createClock();
    const game = engine.createGame({
      gameId: "giveup-game",
      chatId: "giveup-chat",
      creator: createPlayer(1),
      now: now(),
    });

    expect(
      engine.giveUp(game, {
        playerId: "p1",
        turnRecordId: "turn-1",
        now: now(),
      }),
    ).toBeInstanceOf(ExpectedStageMismatchError);
  });

  it("resolves REVERSE mode through YES, NO, GUESSED, give up exhaustion, and final reverse stats", () => {
    const setup = setupConfiguredGame({
      playerCount: 3,
      mode: "REVERSE",
      playMode: "OFFLINE",
    });
    const { players, now } = setup;
    let game = prepareAllWords({ game: setup.game, players, now });
    game = unwrap(engine.startGameIfReady(game, now()));

    const initialTargetId = mustBeDefined(
      game.inProgress.currentTargetPlayerId,
      "Expected reverse target",
    );
    const initialAskerId = mustBeDefined(
      game.inProgress.turnOrder[game.inProgress.turnCursor],
      "Expected reverse asker",
    );

    game = unwrap(
      engine.askQuestion(game, {
        actorPlayerId: initialAskerId,
        voteId: "reverse-vote-1",
        now: now(),
      }),
    );
    expect(game.inProgress.pendingVote).toMatchObject({
      askerPlayerId: initialAskerId,
      targetWordOwnerId: initialTargetId,
      eligibleVoterIds: [initialTargetId],
    });

    game = unwrap(
      engine.castVote(game, {
        voterPlayerId: initialTargetId,
        decision: "YES",
        voteRecordId: "reverse-record-1",
        turnRecordId: "reverse-turn-1",
        now: now(),
      }),
    );
    expect(game.turns[0]).toMatchObject({ outcome: "YES", targetWordOwnerId: initialTargetId });
    expect(game.inProgress.currentTargetPlayerId).toBe(initialTargetId);
    expect(game.inProgress.turnOrder[game.inProgress.turnCursor]).toBe(initialAskerId);

    game = unwrap(
      engine.askQuestion(game, {
        actorPlayerId: initialAskerId,
        voteId: "reverse-vote-2",
        now: now(),
      }),
    );
    game = unwrap(
      engine.castVote(game, {
        voterPlayerId: initialTargetId,
        decision: "NO",
        voteRecordId: "reverse-record-2",
        turnRecordId: "reverse-turn-2",
        now: now(),
      }),
    );

    const secondAskerId = mustBeDefined(
      game.inProgress.turnOrder[game.inProgress.turnCursor],
      "Expected second reverse asker",
    );
    expect(secondAskerId).not.toBe(initialAskerId);

    game = unwrap(
      engine.giveUp(game, {
        playerId: secondAskerId,
        turnRecordId: "reverse-turn-3",
        now: now(),
      }),
    );
    expect(game.progress[secondAskerId]?.reverseGiveUpsByTarget).toEqual([
      initialTargetId,
    ]);
    expect(game.inProgress.turnOrder[game.inProgress.turnCursor]).toBe(initialAskerId);

    game = unwrap(
      engine.askQuestion(game, {
        actorPlayerId: initialAskerId,
        voteId: "reverse-vote-3",
        now: now(),
      }),
    );
    game = unwrap(
      engine.castVote(game, {
        voterPlayerId: initialTargetId,
        decision: "GUESSED",
        voteRecordId: "reverse-record-3",
        turnRecordId: "reverse-turn-4",
        now: now(),
      }),
    );

    expect(game.words[initialTargetId]?.solved).toBe(true);
    expect(game.inProgress.currentTargetPlayerId).not.toBe(initialTargetId);

    while (game.stage !== "FINISHED") {
      const askerId = mustBeDefined(
        game.inProgress.turnOrder[game.inProgress.turnCursor],
        "Expected reverse loop asker",
      );
      const targetId = mustBeDefined(
        game.inProgress.currentTargetPlayerId,
        "Expected reverse loop target",
      );

      game = unwrap(
        engine.askQuestion(game, {
          actorPlayerId: askerId,
          voteId: `reverse-vote-${now()}`,
          now: now(),
        }),
      );
      game = unwrap(
        engine.castVote(game, {
          voterPlayerId: targetId,
          decision: "GUESSED",
          voteRecordId: `reverse-record-${now()}`,
          turnRecordId: `reverse-turn-${now()}`,
          now: now(),
        }),
      );
    }

    expect(game.stage).toBe("FINISHED");
    expect(game.result?.mode).toBe("REVERSE");
    expect(game.result?.reverse?.asWordOwner).toHaveLength(players.length);
    expect(game.result?.reverse?.asGuesser).toHaveLength(players.length);
    expect(Object.values(game.words).every((entry) => entry.solved)).toBe(true);
    expect(game.turns.map((turn) => turn.outcome)).toEqual(
      expect.arrayContaining(["YES", "NO", "GIVEUP", "GUESSED"]),
    );
  });
});
