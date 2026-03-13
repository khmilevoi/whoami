import { describe, expect, it } from "vitest";
import {
  OnlyGameCreatorCanCancelError,
  PlayerNotAllowedToVoteError,
} from "../../src/domain/errors.js";
import { PairingMode, PlayMode, VoteDecision } from "../../src/domain/types.js";
import { createGameServiceHarness } from "./game-service.harness.js";
import { parseManualPairPayload } from "../../src/adapters/telegram/manual-pair-payload.js";
import { mustBeDefined } from "../support/strict-helpers.js";

const flushReactiveEffects = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const askCurrentQuestion = async ({
  harness,
  gameId,
  playMode,
  text,
}: {
  harness: ReturnType<typeof createGameServiceHarness>;
  gameId: string;
  playMode: PlayMode;
  text: string;
}) => {
  const game = harness.getGameById(gameId);
  const asker = harness.getCurrentAsker(gameId);

  if (playMode === "ONLINE") {
    await harness.service.handleGroupText(game.chatId, asker.telegramUserId, text);
  } else {
    await harness.service.askOffline(game.chatId, asker.telegramUserId);
  }

  return harness.getGameById(gameId);
};

const voteAllEligible = async (
  harness: ReturnType<typeof createGameServiceHarness>,
  gameId: string,
  decision: VoteDecision,
) => {
  const pending = mustBeDefined(
    harness.getGameById(gameId).inProgress.pendingVote,
    `Expected pending vote for ${gameId}`,
  );
  const decisions = Object.fromEntries(
    pending.eligibleVoterIds.map((playerId) => [playerId, decision]),
  );
  return harness.resolvePendingVote(gameId, decisions);
};

const finishNormalScenario = async ({
  pairingMode,
  playMode,
}: {
  pairingMode: PairingMode;
  playMode: PlayMode;
}) => {
  const harness = createGameServiceHarness();
  const actors = harness.createActors(3);
  const chatId = `chat-normal-${playMode.toLowerCase()}-${pairingMode.toLowerCase()}`;
  const manualPairs = {
    [actors[0]!.telegramUserId]: actors[1]!.telegramUserId,
    [actors[1]!.telegramUserId]: actors[2]!.telegramUserId,
    [actors[2]!.telegramUserId]: actors[0]!.telegramUserId,
  };

  const started = await harness.setupInProgressGame({
    chatId,
    actors,
    mode: "NORMAL",
    playMode,
    pairingMode,
    manualPairsByChooser: pairingMode === "MANUAL" ? manualPairs : undefined,
  });

  expect(started.stage).toBe("IN_PROGRESS");
  expect(started.config).toEqual({
    mode: "NORMAL",
    playMode,
    pairingMode,
  });

  if (pairingMode === "MANUAL") {
    expect(started.pairings).toEqual({
      "tg:1": "tg:2",
      "tg:2": "tg:3",
      "tg:3": "tg:1",
    });
  } else {
    for (const player of started.players) {
      expect(started.pairings[player.id]).not.toBe(player.id);
    }
  }

  const firstAsker = harness.getCurrentAsker(started.id);
  let game = await askCurrentQuestion({
    harness,
    gameId: started.id,
    playMode,
    text: "question-1",
  });
  expect(game.inProgress.pendingVote?.askerPlayerId).toBe(firstAsker.id);
  expect(game.inProgress.pendingVote?.questionText).toBe(
    playMode === "ONLINE" ? "question-1" : undefined,
  );

  game = await voteAllEligible(harness, started.id, "NO");
  expect(game.turns.at(-1)).toMatchObject({
    askerPlayerId: firstAsker.id,
    outcome: "NO",
  });

  const secondAsker = harness.getCurrentAsker(started.id);
  expect(secondAsker.id).not.toBe(firstAsker.id);

  game = await askCurrentQuestion({
    harness,
    gameId: started.id,
    playMode,
    text: "question-2",
  });
  expect(game.inProgress.pendingVote?.eligibleVoterIds).toContain(firstAsker.id);

  game = await voteAllEligible(harness, started.id, "GUESSED");
  expect(game.players.find((player) => player.id === secondAsker.id)?.stage).toBe(
    "GUESSED",
  );
  expect(game.progress[secondAsker.id]).toMatchObject({
    guessedAtRound: 1,
    questionsAsked: 1,
  });

  const activePlayers = game.players.filter(
    (player) => player.stage !== "GUESSED" && player.stage !== "GAVE_UP",
  );
  for (const player of activePlayers) {
    await harness.service.giveUp(chatId, player.telegramUserId);
  }

  const finished = harness.getGameById(started.id);
  expect(finished.stage).toBe("FINISHED");
  expect(finished.result?.mode).toBe("NORMAL");
  expect(finished.result?.normal).toHaveLength(3);
  expect(finished.turns.map((turn) => turn.outcome)).toEqual(
    expect.arrayContaining(["NO", "GUESSED", "GIVEUP"]),
  );
};

const finishReverseScenario = async ({ playMode }: { playMode: PlayMode }) => {
  const harness = createGameServiceHarness();
  const actors = harness.createActors(3);
  const chatId = `chat-reverse-${playMode.toLowerCase()}`;

  const started = await harness.setupInProgressGame({
    chatId,
    actors,
    mode: "REVERSE",
    playMode,
  });

  expect(started.stage).toBe("IN_PROGRESS");
  expect(started.config).toEqual({
    mode: "REVERSE",
    playMode,
    pairingMode: undefined,
  });

  const initialTarget = mustBeDefined(
    harness.getCurrentTarget(started.id),
    "Expected initial reverse target",
  );
  const initialAsker = harness.getCurrentAsker(started.id);

  let game = await askCurrentQuestion({
    harness,
    gameId: started.id,
    playMode,
    text: "reverse-question-1",
  });
  expect(game.inProgress.pendingVote?.askerPlayerId).toBe(initialAsker.id);
  expect(game.inProgress.pendingVote?.targetWordOwnerId).toBe(initialTarget.id);
  expect(game.inProgress.pendingVote?.eligibleVoterIds).toEqual([initialTarget.id]);
  expect(game.inProgress.pendingVote?.questionText).toBe(
    playMode === "ONLINE" ? "reverse-question-1" : undefined,
  );

  await harness.service.handleVote(started.id, initialTarget.telegramUserId, "YES");
  game = harness.getGameById(started.id);
  expect(game.turns.at(-1)).toMatchObject({ outcome: "YES" });
  expect(harness.getCurrentTarget(started.id)?.id).toBe(initialTarget.id);
  expect(harness.getCurrentAsker(started.id).id).toBe(initialAsker.id);

  await askCurrentQuestion({
    harness,
    gameId: started.id,
    playMode,
    text: "reverse-question-2",
  });
  await harness.service.handleVote(started.id, initialTarget.telegramUserId, "NO");
  game = harness.getGameById(started.id);
  const secondAsker = harness.getCurrentAsker(started.id);
  expect(secondAsker.id).not.toBe(initialAsker.id);
  expect(harness.getCurrentTarget(started.id)?.id).toBe(initialTarget.id);

  await harness.service.giveUp(chatId, secondAsker.telegramUserId);
  game = harness.getGameById(started.id);
  expect(game.progress[secondAsker.id]?.reverseGiveUpsByTarget).toEqual([
    initialTarget.id,
  ]);

  const askerAfterGiveUp = harness.getCurrentAsker(started.id);
  await askCurrentQuestion({
    harness,
    gameId: started.id,
    playMode,
    text: "reverse-question-3",
  });
  await harness.service.handleVote(started.id, initialTarget.telegramUserId, "GUESSED");
  game = harness.getGameById(started.id);
  expect(game.words[initialTarget.id]?.solved).toBe(true);
  expect(harness.getCurrentTarget(started.id)?.id).not.toBe(initialTarget.id);
  expect(game.turns.at(-1)).toMatchObject({
    askerPlayerId: askerAfterGiveUp.id,
    outcome: "GUESSED",
  });

  while (harness.getGameById(started.id).stage !== "FINISHED") {
    const target = mustBeDefined(
      harness.getCurrentTarget(started.id),
      "Expected reverse target during finish loop",
    );
    await askCurrentQuestion({
      harness,
      gameId: started.id,
      playMode,
      text: `reverse-question-${target.id}`,
    });
    await harness.service.handleVote(started.id, target.telegramUserId, "GUESSED");
  }

  const finished = harness.getGameById(started.id);
  expect(finished.stage).toBe("FINISHED");
  expect(finished.result?.mode).toBe("REVERSE");
  expect(finished.result?.reverse?.asWordOwner).toHaveLength(3);
  expect(finished.result?.reverse?.asGuesser).toHaveLength(3);
  expect(Object.values(finished.words).every((entry) => entry.solved)).toBe(true);
};

describe("game service", () => {
  it("runs NORMAL + ONLINE + RANDOM as a full state-based flow", async () => {
    await finishNormalScenario({ playMode: "ONLINE", pairingMode: "RANDOM" });
  });

  it("runs NORMAL + OFFLINE + RANDOM as a full state-based flow", async () => {
    await finishNormalScenario({ playMode: "OFFLINE", pairingMode: "RANDOM" });
  });

  it("runs NORMAL + ONLINE + MANUAL as a full state-based flow", async () => {
    await finishNormalScenario({ playMode: "ONLINE", pairingMode: "MANUAL" });
  });

  it("runs NORMAL + OFFLINE + MANUAL as a full state-based flow", async () => {
    await finishNormalScenario({ playMode: "OFFLINE", pairingMode: "MANUAL" });
  });

  it("runs REVERSE + ONLINE as a full state-based flow", async () => {
    await finishReverseScenario({ playMode: "ONLINE" });
  });

  it("runs REVERSE + OFFLINE as a full state-based flow", async () => {
    await finishReverseScenario({ playMode: "OFFLINE" });
  });

  it("marks creator as BLOCKED_DM when configuration DM cannot be delivered", async () => {
    const harness = createGameServiceHarness();
    const actors = harness.createActors(3);
    const chatId = "chat-blocked-config";

    harness.notifier.setPrivateKeyboardFailure(actors[0]!.telegramUserId);

    await harness.service.startGame(chatId, actors[0]!);
    await harness.service.joinGame(chatId, actors[1]!);
    await harness.service.joinGame(chatId, actors[2]!);
    await harness.service.beginConfiguration(chatId, actors[0]!.telegramUserId);
    await flushReactiveEffects();

    const game = harness.getGameByChat(chatId);
    expect(game.stage).toBe("CONFIGURING");
    expect(
      game.players.find((player) => player.id === game.creatorPlayerId)?.stage,
    ).toBe("BLOCKED_DM");
  });

  it("marks player as BLOCKED_DM when word collection DM cannot be delivered", async () => {
    const harness = createGameServiceHarness();
    const actors = harness.createActors(3);
    const chatId = "chat-blocked-word";

    await harness.service.startGame(chatId, actors[0]!);
    await harness.service.joinGame(chatId, actors[1]!);
    await harness.service.joinGame(chatId, actors[2]!);
    await harness.service.beginConfiguration(chatId, actors[0]!.telegramUserId);
    await flushReactiveEffects();

    const game = harness.getGameByChat(chatId);
    harness.notifier.setPrivateMessageFailure(actors[1]!.telegramUserId);

    await harness.configureGame(
      game.id,
      actors[0]!.telegramUserId,
      "NORMAL",
      "ONLINE",
      "RANDOM",
    );
    await flushReactiveEffects();

    const updated = harness.getGameById(game.id);
    expect(updated.stage).toBe("PREPARE_WORDS");
    expect(
      updated.players.find(
        (player) => player.telegramUserId === actors[1]!.telegramUserId,
      )?.stage,
    ).toBe("BLOCKED_DM");
  });

  it("keeps reverse pending vote unchanged when a non-target player tries to vote", async () => {
    const harness = createGameServiceHarness();
    const actors = harness.createActors(3);
    const chatId = "chat-invalid-voter";
    const started = await harness.setupInProgressGame({
      chatId,
      actors,
      mode: "REVERSE",
      playMode: "ONLINE",
    });

    await askCurrentQuestion({
      harness,
      gameId: started.id,
      playMode: "ONLINE",
      text: "who am i",
    });

    const gameWithVote = harness.getGameById(started.id);
    const targetId = mustBeDefined(
      gameWithVote.inProgress.pendingVote?.targetWordOwnerId,
      "Expected reverse target in pending vote",
    );
    const intruder = mustBeDefined(
      gameWithVote.players.find((player) => player.id !== targetId),
      "Expected intruder player",
    );

    await expect(
      harness.service.handleVote(started.id, intruder.telegramUserId, "YES"),
    ).resolves.toBeInstanceOf(PlayerNotAllowedToVoteError);

    const unchanged = harness.getGameById(started.id);
    expect(unchanged.inProgress.pendingVote).toMatchObject({
      targetWordOwnerId: targetId,
      votes: {},
    });
    expect(unchanged.turns).toHaveLength(0);
  });

  it("leaves lobby state unchanged when give up is requested before IN_PROGRESS", async () => {
    const harness = createGameServiceHarness();
    const actors = harness.createActors(2);
    const chatId = "chat-early-giveup";

    await harness.service.startGame(chatId, actors[0]!);
    await harness.service.joinGame(chatId, actors[1]!);
    await harness.service.giveUp(chatId, actors[0]!.telegramUserId);

    const game = harness.getGameByChat(chatId);
    expect(game.stage).toBe("LOBBY_OPEN");
    expect(game.turns).toEqual([]);
    expect(game.result).toBeUndefined();
  });

  it("allows cancel only for the creator and persists canceled state", async () => {
    const harness = createGameServiceHarness({ minPlayers: 2 });
    const actors = harness.createActors(2);
    const chatId = "chat-cancel";

    await harness.service.startGame(chatId, actors[0]!);
    await harness.service.joinGame(chatId, actors[1]!);
    const gameId = harness.getGameByChat(chatId).id;

    await expect(
      harness.service.cancel(chatId, actors[1]!.telegramUserId),
    ).resolves.toBeInstanceOf(OnlyGameCreatorCanCancelError);
    expect(harness.getGameByChat(chatId).stage).toBe("LOBBY_OPEN");

    await harness.service.cancel(chatId, actors[0]!.telegramUserId);

    const canceled = harness.repository.findById(gameId);
    expect(canceled?.stage).toBe("CANCELED");
    expect(canceled?.canceledReason).toBe("Canceled by creator");
  });

  it("restarts word drafting on confirm NO and final NO through the public service API", async () => {
    const harness = createGameServiceHarness();
    const actors = harness.createActors(3);
    const configured = await harness.setupConfiguredGame({
      chatId: "chat-word-restart",
      actors,
      mode: "REVERSE",
      playMode: "ONLINE",
    });

    await harness.service.handlePrivateText(actors[0]!.telegramUserId, "planet");
    let game = harness.getGameById(configured.id);
    expect(game.words["tg:1"]?.word).toBe("planet");

    await harness.service.handleWordCallback(
      configured.id,
      actors[0]!.telegramUserId,
      "confirm",
      "NO",
    );
    game = harness.getGameById(configured.id);
    expect(game.words["tg:1"]?.word).toBeUndefined();
    expect(game.words["tg:1"]?.clue).toBeUndefined();
    expect(game.words["tg:1"]?.wordConfirmed).toBe(false);
    expect(game.words["tg:1"]?.finalConfirmed).toBe(false);

    await harness.service.handlePrivateText(actors[0]!.telegramUserId, "mars");
    await harness.service.handleWordCallback(
      configured.id,
      actors[0]!.telegramUserId,
      "confirm",
      "YES",
    );
    await harness.service.handleWordCallback(
      configured.id,
      actors[0]!.telegramUserId,
      "clue",
      "YES",
    );
    await harness.service.handlePrivateText(actors[0]!.telegramUserId, "red world");
    await harness.service.handleWordCallback(
      configured.id,
      actors[0]!.telegramUserId,
      "final",
      "NO",
    );

    game = harness.getGameById(configured.id);
    expect(game.words["tg:1"]?.word).toBeUndefined();
    expect(game.words["tg:1"]?.clue).toBeUndefined();
    expect(game.words["tg:1"]?.wordConfirmed).toBe(false);
    expect(game.words["tg:1"]?.finalConfirmed).toBe(false);
    expect(game.players.find((player) => player.id === "tg:1")?.stage).toBe(
      "WORD_DRAFT",
    );
  });

  it("marks dmOpened for every active game when a player starts private chat", async () => {
    const harness = createGameServiceHarness();
    const sharedActor = harness.createActor(1);
    const gameOneActors = [sharedActor, harness.createActor(2), harness.createActor(3)];
    const gameTwoActors = [sharedActor, harness.createActor(4), harness.createActor(5)];

    const gameOne = await harness.setupConfiguredGame({
      chatId: "chat-private-1",
      actors: gameOneActors,
      mode: "REVERSE",
      playMode: "ONLINE",
    });
    const gameTwo = await harness.setupConfiguredGame({
      chatId: "chat-private-2",
      actors: gameTwoActors,
      mode: "NORMAL",
      playMode: "OFFLINE",
      pairingMode: "RANDOM",
    });

    await harness.service.handlePrivateStart(sharedActor);

    expect(
      harness.getPlayerByTelegram(gameOne.id, sharedActor.telegramUserId).dmOpened,
    ).toBe(true);
    expect(
      harness.getPlayerByTelegram(gameTwo.id, sharedActor.telegramUserId).dmOpened,
    ).toBe(true);
  });

  it("parses manual pair callback with colon-delimited player id and advances 2-player OFFLINE game", async () => {
    const harness = createGameServiceHarness({ minPlayers: 2 });
    const actors = harness.createActors(2);
    const configured = await harness.setupConfiguredGame({
      chatId: "chat-manual-offline-two-players",
      actors,
      mode: "NORMAL",
      playMode: "OFFLINE",
      pairingMode: "MANUAL",
    });

    expect(configured.stage).toBe("PREPARE_WORDS");
    expect(configured.words).toEqual({});

    const parsed = parseManualPairPayload(`pair:tg:${actors[1]!.telegramUserId}:${configured.id}`);
    expect(parsed).not.toBeInstanceOf(Error);
    if (parsed instanceof Error) {
      return;
    }

    await harness.service.applyManualPair(
      parsed.gameId,
      actors[0]!.telegramUserId,
      parsed.targetPlayerId,
    );
    await harness.service.applyManualPair(
      configured.id,
      actors[1]!.telegramUserId,
      "tg:1",
    );

    const paired = harness.getGameById(configured.id);
    expect(paired.pairings).toEqual({
      "tg:1": "tg:2",
      "tg:2": "tg:1",
    });
    expect(Object.keys(paired.words)).toHaveLength(2);
    expect(Object.values(paired.words)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ownerPlayerId: "tg:1", targetPlayerId: "tg:2" }),
        expect.objectContaining({ ownerPlayerId: "tg:2", targetPlayerId: "tg:1" }),
      ]),
    );
  });
});



