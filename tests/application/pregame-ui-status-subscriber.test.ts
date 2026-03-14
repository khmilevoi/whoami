import { describe, expect, it } from "vitest";
import { GameServiceContext } from "../../src/application/game-service-context.js";
import { InMemoryGameStatusService } from "../../src/application/game-status-service.js";
import { PregameUiStatusSubscriber } from "../../src/application/pregame-ui-status-subscriber.js";
import { ConfigDraftStore } from "../../src/application/stores/config-draft-store.js";
import { PrivateExpectationStore } from "../../src/application/stores/private-expectation-store.js";
import { PregameUiStateStore } from "../../src/application/stores/pregame-ui-state-store.js";
import { createGameServiceHarness } from "./game-service.harness.js";
import { mustBeDefined } from "../support/strict-helpers.js";

const createSubscriberHarness = () => {
  const game = createGameServiceHarness({ subscribePregameUiSubscriber: false });
  const statusService = new InMemoryGameStatusService(game.repository, game.logger);
  const configDraftStore = new ConfigDraftStore();
  const expectationStore = new PrivateExpectationStore();
  const uiStateStore = new PregameUiStateStore();
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
    statusService,
  });
  const subscriber = new PregameUiStatusSubscriber(
    context,
    configDraftStore,
    expectationStore,
    uiStateStore,
  );

  return {
    game,
    statusService,
    subscriber,
    uiStateStore,
    configDraftStore,
  };
};

const transitionForGame = (gameId: string) => ({
  previous: null,
  current: { gameId } as never,
  changed: {} as never,
});

describe("pregame ui status subscriber", () => {
  it("serializes concurrent syncs so the first group status is created once", async () => {
    const harness = createSubscriberHarness();
    const actor = harness.game.createActor(1);

    await harness.game.service.startGame("chat-ui-race", actor);
    const game = mustBeDefined(
      harness.game.repository.findActiveByChatId("chat-ui-race"),
      "Expected lobby game",
    );

    harness.game.notifier.sent.length = 0;
    const release = harness.game.notifier.delayNextGroupSend();
    const first = harness.subscriber.onGameStatusChanged(transitionForGame(game.id));
    const second = harness.subscriber.onGameStatusChanged(transitionForGame(game.id));

    await Promise.resolve();
    release();
    await Promise.all([first, second]);

    expect(
      harness.game.notifier.sent.filter((entry) => entry.kind === "group-message"),
    ).toHaveLength(1);
    expect(
      harness.game.notifier.sent.filter((entry) => entry.kind === "group-edit"),
    ).toHaveLength(0);
  });

  it("skips telegram when the repeated group render is identical", async () => {
    const harness = createSubscriberHarness();
    const actor = harness.game.createActor(1);

    await harness.game.service.startGame("chat-ui-repeat", actor);
    const game = mustBeDefined(
      harness.game.repository.findActiveByChatId("chat-ui-repeat"),
      "Expected lobby game",
    );

    await harness.subscriber.syncGame(game.id);
    harness.game.notifier.sent.length = 0;

    await harness.subscriber.syncGame(game.id);

    expect(
      harness.game.notifier.sent.filter((entry) => entry.kind === "group-message"),
    ).toHaveLength(0);
    expect(
      harness.game.notifier.sent.filter((entry) => entry.kind === "group-edit"),
    ).toHaveLength(0);
  });

  it("does not post duplicate group updates when PREPARE_WORDS changes keep the same status text", async () => {
    const harness = createSubscriberHarness();
    const actors = harness.game.createActors(3);
    const configured = await harness.game.setupConfiguredGame({
      chatId: "chat-ui-prepare-unchanged",
      actors,
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
    });

    await harness.subscriber.syncGame(configured.id);
    harness.game.notifier.sent.length = 0;

    await harness.game.service.handlePrivateText(actors[0]!.telegramUserId, "draft-word");
    await harness.subscriber.syncGame(configured.id);

    expect(
      harness.game.notifier.sent.filter((entry) => entry.kind === "group-message"),
    ).toHaveLength(0);
    expect(
      harness.game.notifier.sent.filter((entry) => entry.kind === "group-edit"),
    ).toHaveLength(0);
  });

  it("does not post duplicate group updates when IN_PROGRESS changes keep the same status text", async () => {
    const harness = createSubscriberHarness();
    const actors = harness.game.createActors(3);
    const started = await harness.game.setupInProgressGame({
      chatId: "chat-ui-in-progress-unchanged",
      actors,
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
    });
    const asker = harness.game.getCurrentAsker(started.id);

    await harness.subscriber.syncGame(started.id);
    harness.game.notifier.sent.length = 0;

    await harness.game.service.handleGroupText(started.chatId, asker.telegramUserId, "?");
    await harness.subscriber.syncGame(started.id);

    expect(
      harness.game.notifier.sent.filter((entry) => entry.kind === "group-message"),
    ).toHaveLength(0);
    expect(
      harness.game.notifier.sent.filter((entry) => entry.kind === "group-edit"),
    ).toHaveLength(0);
  });

  it("does not resend or block a private panel when the render is unchanged", async () => {
    const harness = createSubscriberHarness();
    const actors = harness.game.createActors(3);

    await harness.game.service.startGame("chat-ui-private-unchanged", actors[0]!);
    await harness.game.service.joinGame("chat-ui-private-unchanged", actors[1]!);
    await harness.game.service.joinGame("chat-ui-private-unchanged", actors[2]!);
    await harness.game.service.beginConfiguration(
      "chat-ui-private-unchanged",
      actors[0]!.telegramUserId,
    );

    const game = mustBeDefined(
      harness.game.repository.findActiveByChatId("chat-ui-private-unchanged"),
      "Expected configuring game",
    );
    const creator = mustBeDefined(
      game.players.find((player) => player.id === game.creatorPlayerId),
      "Expected creator",
    );

    creator.dmOpened = true;
    harness.game.repository.update(game);

    await harness.subscriber.syncGame(game.id);
    harness.game.notifier.sent.length = 0;
    harness.game.notifier.setPrivateEditUnchanged(creator.telegramUserId);

    await harness.subscriber.syncGame(game.id);

    expect(
      harness.game.notifier.sent.filter((entry) => entry.kind.startsWith("private")),
    ).toHaveLength(0);
    expect(
      harness.game.getGameById(game.id).players.find((player) => player.id === creator.id)?.stage,
    ).not.toBe("BLOCKED_DM");
  });

  it("clears stale private panel state when DM delivery becomes blocked", async () => {
    const harness = createSubscriberHarness();
    const actors = harness.game.createActors(3);

    await harness.game.service.startGame("chat-ui-blocked-state", actors[0]!);
    await harness.game.service.joinGame("chat-ui-blocked-state", actors[1]!);
    await harness.game.service.joinGame("chat-ui-blocked-state", actors[2]!);
    await harness.game.service.beginConfiguration(
      "chat-ui-blocked-state",
      actors[0]!.telegramUserId,
    );

    const game = mustBeDefined(
      harness.game.repository.findActiveByChatId("chat-ui-blocked-state"),
      "Expected configuring game",
    );
    const creator = mustBeDefined(
      game.players.find((player) => player.id === game.creatorPlayerId),
      "Expected creator",
    );

    creator.dmOpened = true;
    harness.game.repository.update(game);
    harness.uiStateStore.set(game.id, {
      groupStatusMessageId: 77,
      groupRenderKey: "group-render",
      privatePanels: {
        [creator.id]: {
          chatId: creator.telegramUserId,
          messageId: 88,
          renderKey: "private-render",
        },
      },
    });
    harness.game.notifier.setPrivateEditFailure(creator.telegramUserId);
    harness.game.notifier.setPrivateKeyboardFailure(creator.telegramUserId);

    await harness.subscriber.syncGame(game.id);

    expect(
      harness.game.getGameById(game.id).players.find((player) => player.id === creator.id)?.stage,
    ).toBe("BLOCKED_DM");
    expect(harness.uiStateStore.get(game.id).privatePanels[creator.id]).toBeUndefined();
  });
});
