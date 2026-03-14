import { describe, expect, it } from "vitest";
import { GameFlowStatusSubscriber } from "../../src/application/game-flow-status-subscriber.js";
import { GameServiceContext } from "../../src/application/game-service-context.js";
import { NormalModeService } from "../../src/application/modes/normal-mode-service.js";
import { ReverseModeService } from "../../src/application/modes/reverse-mode-service.js";
import { createGameServiceHarness, GameServiceHarness } from "./game-service.harness.js";
import { mustBeDefined } from "../support/strict-helpers.js";

const changed = (
  overrides: Partial<{
    stageChanged: boolean;
    playersChanged: boolean;
    readinessChanged: boolean;
    manualPairingChanged: boolean;
    turnChanged: boolean;
    pendingVoteChanged: boolean;
    commandsRelevantChanged: boolean;
    becameInactive: boolean;
  }> = {},
) => ({
  stageChanged: false,
  playersChanged: false,
  readinessChanged: false,
  manualPairingChanged: false,
  turnChanged: false,
  pendingVoteChanged: false,
  commandsRelevantChanged: false,
  becameInactive: false,
  ...overrides,
});

const createFlowHarness = (options?: { minPlayers?: number }) => {
  const game = createGameServiceHarness({ ...options, subscribePregameUiSubscriber: false });
  const context = new GameServiceContext({
    engine: game.engine,
    repository: game.repository,
    transactionRunner: game.transactionRunner,
    notifier: game.notifier,
    identity: game.identity,
    idPort: game.idPort,
    clock: game.clock,
    logger: game.logger,
    texts: game.texts,
    limits: game.limits,
    statusService: game.statusService,
  });
  const normalMode = new NormalModeService(context);
  const reverseMode = new ReverseModeService(context);
  const subscriber = new GameFlowStatusSubscriber(context, [normalMode, reverseMode]);
  game.statusService.subscribe(subscriber);

  return { game, context, normalMode, reverseMode, subscriber };
};

const groupMessages = (harness: { game: GameServiceHarness }) =>
  harness.game.notifier.sent.filter((notification) => notification.kind === "group-message");

const flushReactiveEffects = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("game flow status subscriber", () => {
  it("ignores transitions without a current game snapshot", async () => {
    const harness = createFlowHarness();

    await expect(
      harness.subscriber.onGameStatusChanged({
        previous: null,
        current: null,
        changed: changed(),
      }),
    ).resolves.toBeUndefined();
    expect(harness.game.notifier.sent).toEqual([]);
  });

  it("treats lobby and configuring transitions without config as no-ops", async () => {
    const harness = createFlowHarness();
    const actors = harness.game.createActors(3);

    await harness.game.service.startGame("chat-flow-lobby", actors[0]!);
    const lobbySnapshot = mustBeDefined(
      harness.game.statusService.getByChatId("chat-flow-lobby"),
      "Expected lobby snapshot",
    );

    await flushReactiveEffects();
    harness.game.notifier.sent.length = 0;
    await expect(
      harness.subscriber.onGameStatusChanged({
        previous: null,
        current: lobbySnapshot,
        changed: changed(),
      }),
    ).resolves.toBeUndefined();
    expect(harness.game.notifier.sent).toEqual([]);

    await harness.game.service.joinGame("chat-flow-lobby", actors[1]!);
    await harness.game.service.joinGame("chat-flow-lobby", actors[2]!);
    await harness.game.service.beginConfiguration(
      "chat-flow-lobby",
      actors[0]!.telegramUserId,
    );

    const configuringSnapshot = mustBeDefined(
      harness.game.statusService.getByChatId("chat-flow-lobby"),
      "Expected configuring snapshot",
    );

    await flushReactiveEffects();
    harness.game.notifier.sent.length = 0;
    await expect(
      harness.subscriber.onGameStatusChanged({
        previous: lobbySnapshot,
        current: configuringSnapshot,
        changed: changed({ stageChanged: true }),
      }),
    ).resolves.toBeUndefined();
    expect(harness.game.notifier.sent).toEqual([]);
  });

  it("announces cancel before configuration is set", async () => {
    const harness = createFlowHarness();
    const actors = harness.game.createActors(3);

    await harness.game.service.startGame("chat-flow-lobby-cancel", actors[0]!);
    await harness.game.service.joinGame("chat-flow-lobby-cancel", actors[1]!);
    await harness.game.service.joinGame("chat-flow-lobby-cancel", actors[2]!);

    const lobbyGameId = mustBeDefined(
      harness.game.repository.findActiveByChatId("chat-flow-lobby-cancel"),
      "Expected lobby game",
    ).id;

    await flushReactiveEffects();
    harness.game.notifier.sent.length = 0;
    await harness.game.service.cancel(
      "chat-flow-lobby-cancel",
      actors[0]!.telegramUserId,
    );
    await flushReactiveEffects();

    const canceled = mustBeDefined(
      harness.game.repository.findById(lobbyGameId),
      "Expected canceled game",
    );
    expect(groupMessages(harness).map((notification) => notification.text)).toContain(
      harness.context.textsForGame(canceled).gameCancelledByCreator(),
    );
  });

  it("announces the first NORMAL turn after all players finish word preparation", async () => {
    const harness = createFlowHarness();
    const actors = harness.game.createActors(3);
    const configured = await harness.game.setupConfiguredGame({
      chatId: "chat-flow-normal-start",
      actors,
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
    });

    await flushReactiveEffects();
    harness.game.notifier.sent.length = 0;
    await harness.game.completeWordCollection(configured.id, actors);
    await flushReactiveEffects();

    const started = harness.game.getGameById(configured.id);
    const currentAsker = harness.game.getCurrentAsker(started.id);
    const texts = harness.context.textsForGame(started);

    expect(started.stage).toBe("IN_PROGRESS");
    expect(
      harness.game.notifier.sent.filter(
        (notification) => notification.kind === "private-message",
      ),
    ).toHaveLength(actors.length);
    expect(groupMessages(harness).map((notification) => notification.text)).toEqual(
      expect.arrayContaining([
        texts.allReadyGameStarts(),
        texts.currentTurn(harness.context.playerLabel(started, currentAsker.id)),
      ]),
    );
  });

  it("sends a reverse pending-vote prompt when a new question is asked", async () => {
    const harness = createFlowHarness();
    const actors = harness.game.createActors(3);
    const started = await harness.game.setupInProgressGame({
      chatId: "chat-flow-reverse-prompt",
      actors,
      mode: "REVERSE",
      playMode: "ONLINE",
    });
    const asker = harness.game.getCurrentAsker(started.id);
    const target = mustBeDefined(
      harness.game.getCurrentTarget(started.id),
      "Expected reverse target",
    );

    await flushReactiveEffects();
    harness.game.notifier.sent.length = 0;
    await harness.game.service.handleGroupText(
      started.chatId,
      asker.telegramUserId,
      "reverse question",
    );
    await flushReactiveEffects();

    const updated = harness.game.getGameById(started.id);
    const prompt = mustBeDefined(
      [...groupMessages(harness)]
        .reverse()
        .find((notification) => notification.buttons),
      "Expected reverse vote prompt",
    );

    expect(prompt.text).toBe(
      harness.context.textsForGame(updated).reverseVotePrompt(
        harness.context.playerLabel(updated, asker.id),
        harness.context.playerLabel(updated, target.id),
      ),
    );
    expect(
      prompt.buttons?.[0]?.map((button) =>
        button.kind === "callback" ? button.data : button.url,
      ),
    ).toEqual([
      `vote:YES:${started.id}`,
      `vote:NO:${started.id}`,
      `vote:GUESSED:${started.id}`,
    ]);
  });

  it("publishes a vote summary and the next turn after a NORMAL NO result", async () => {
    const harness = createFlowHarness();
    const actors = harness.game.createActors(3);
    const started = await harness.game.setupInProgressGame({
      chatId: "chat-flow-normal-no",
      actors,
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
    });
    const firstAsker = harness.game.getCurrentAsker(started.id);

    await flushReactiveEffects();
    harness.game.notifier.sent.length = 0;
    await harness.game.service.handleGroupText(
      started.chatId,
      firstAsker.telegramUserId,
      "normal question",
    );

    const pending = mustBeDefined(
      harness.game.getGameById(started.id).inProgress.pendingVote,
      "Expected pending vote",
    );
    for (const voterId of pending.eligibleVoterIds) {
      const voter = mustBeDefined(
        harness.game
          .getGameById(started.id)
          .players.find((player) => player.id === voterId),
        `Expected voter ${voterId}`,
      );
      await harness.game.service.handleVote(started.id, voter.telegramUserId, "NO");
    }
    await flushReactiveEffects();

    const updated = harness.game.getGameById(started.id);
    const nextAsker = harness.game.getCurrentAsker(started.id);
    const texts = harness.context.textsForGame(updated);

    expect(updated.turns.at(-1)).toMatchObject({
      askerPlayerId: firstAsker.id,
      outcome: "NO",
    });
    expect(groupMessages(harness).map((notification) => notification.text)).toEqual(
      expect.arrayContaining([
        texts.voteSummary("NO"),
        texts.currentTurn(harness.context.playerLabel(updated, nextAsker.id)),
      ]),
    );
  });

  it("publishes cancel and final summary messages from state transitions", async () => {
    const cancelHarness = createFlowHarness();
    const cancelActors = cancelHarness.game.createActors(3);
    const configured = await cancelHarness.game.setupConfiguredGame({
      chatId: "chat-flow-cancel",
      actors: cancelActors,
      mode: "REVERSE",
      playMode: "ONLINE",
    });

    await flushReactiveEffects();
    cancelHarness.game.notifier.sent.length = 0;
    await cancelHarness.game.service.cancel(
      configured.chatId,
      cancelActors[0]!.telegramUserId,
    );
    await flushReactiveEffects();

    const canceled = mustBeDefined(
      cancelHarness.game.repository.findById(configured.id),
      "Expected canceled game",
    );
    expect(canceled.stage).toBe("CANCELED");
    expect(groupMessages(cancelHarness).map((notification) => notification.text)).toContain(
      cancelHarness.context.textsForGame(canceled).gameCancelledByCreator(),
    );

    const finishHarness = createFlowHarness({ minPlayers: 2 });
    const finishActors = finishHarness.game.createActors(2);
    const started = await finishHarness.game.setupInProgressGame({
      chatId: "chat-flow-finish",
      actors: finishActors,
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
    });
    const firstAsker = finishHarness.game.getCurrentAsker(started.id);
    const voter = mustBeDefined(
      started.players.find((player) => player.id !== firstAsker.id),
      "Expected second player",
    );

    await finishHarness.game.service.handleGroupText(
      started.chatId,
      firstAsker.telegramUserId,
      "final question",
    );
    await finishHarness.game.service.handleVote(started.id, voter.telegramUserId, "GUESSED");

    await flushReactiveEffects();
    finishHarness.game.notifier.sent.length = 0;
    const finalAsker = finishHarness.game.getCurrentAsker(started.id);
    await finishHarness.game.service.giveUp(started.chatId, finalAsker.telegramUserId);
    await flushReactiveEffects();

    const finished = finishHarness.game.getGameById(started.id);
    const lines = (finished.result?.normal ?? []).map((row) => {
      const crown = row.crowns.length > 0 ? " 👑" : "";
      return `- ${finishHarness.context.playerLabel(finished, row.playerId)}: ${row.rounds}/${row.questions}${crown}`;
    });

    expect(finished.stage).toBe("FINISHED");
    expect(groupMessages(finishHarness).map((notification) => notification.text)).toEqual(
      expect.arrayContaining([
        finishHarness.context.textsForGame(finished).playerGaveUp(
          finishHarness.context.playerLabel(finished, finalAsker.id),
        ),
        finishHarness.context.textsForGame(finished).normalSummary(lines),
      ]),
    );
  });
});

