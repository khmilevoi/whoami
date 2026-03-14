import { describe, expect, it } from "vitest";
import { GameFlowStatusSubscriber } from "../../src/application/game-flow-status-subscriber.js";
import { GameServiceContext } from "../../src/application/game-service-context.js";
import { NormalModeService } from "../../src/application/modes/normal-mode-service.js";
import { ReverseModeService } from "../../src/application/modes/reverse-mode-service.js";
import { PregameUiStatusSubscriber } from "../../src/application/pregame-ui-status-subscriber.js";
import { ConfigDraftStore } from "../../src/application/stores/config-draft-store.js";
import { PrivateExpectationStore } from "../../src/application/stores/private-expectation-store.js";
import { PregameUiStateStore } from "../../src/application/stores/pregame-ui-state-store.js";
import { createGameServiceHarness } from "./game-service.harness.js";
import { mustBeDefined } from "../support/strict-helpers.js";

const flushReactiveEffects = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const createDeferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

describe("game status service", () => {
  it("waits for the first async subscriber before running the second and keeps going after errors", async () => {
    const harness = createGameServiceHarness({ subscribePregameUiSubscriber: false });
    const deferred = createDeferred();
    const order: string[] = [];

    harness.statusService.subscribe({
      async onGameStatusChanged() {
        order.push("first:start");
        await deferred.promise;
        order.push("first:end");
        return new Error("first failed");
      },
    });
    harness.statusService.subscribe({
      onGameStatusChanged() {
        order.push("second");
      },
    });

    await harness.service.startGame("chat-status-sequential", harness.createActor(1));

    await Promise.resolve();
    expect(order).toEqual(["first:start"]);

    deferred.resolve();
    await flushReactiveEffects();

    expect(order).toEqual(["first:start", "first:end", "second"]);
    expect(
      harness.logger.events.some(
        (event) =>
          event.level === "warn" &&
          event.event === "game_status_subscriber_failed" &&
          event.payload?.["reason"] === "first failed",
      ),
    ).toBe(true);
  });

  it("delivers the group status before game-flow instructions for the same transition", async () => {
    const harness = createGameServiceHarness({ subscribePregameUiSubscriber: false });
    const context = new GameServiceContext({
      engine: harness.engine,
      repository: harness.repository,
      transactionRunner: harness.transactionRunner,
      notifier: harness.notifier,
      identity: harness.identity,
      idPort: harness.idPort,
      clock: harness.clock,
      logger: harness.logger,
      texts: harness.texts,
      limits: harness.limits,
      statusService: harness.statusService,
    });
    const configDraftStore = new ConfigDraftStore();
    const expectationStore = new PrivateExpectationStore();
    const uiStateStore = new PregameUiStateStore();
    const normalMode = new NormalModeService(context);
    const reverseMode = new ReverseModeService(context);


    const actors = harness.createActors(3);
    const configured = await harness.setupConfiguredGame({
      chatId: "chat-status-ordering",
      actors,
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
    });

    for (const actor of actors.slice(0, 2)) {
      await harness.completeWordFlow(configured.id, actor, `word-${actor.telegramUserId}`);
    }

    await harness.service.handlePrivateText(actors[2]!.telegramUserId, "word-3");
    await harness.service.handleWordCallback(
      configured.id,
      actors[2]!.telegramUserId,
      "confirm",
      "YES",
    );
    await harness.service.handleWordCallback(
      configured.id,
      actors[2]!.telegramUserId,
      "clue",
      "NO",
    );

    harness.statusService.subscribe({
      onGameStatusChanged() {
        return;
      },
    });
    harness.statusService.subscribe(
      new PregameUiStatusSubscriber(
        context,
        configDraftStore,
        expectationStore,
        uiStateStore,
      ),
    );
    harness.statusService.subscribe(
      new GameFlowStatusSubscriber(context, [normalMode, reverseMode]),
    );

    harness.notifier.sent.length = 0;
    const release = harness.notifier.delayNextGroupSend();
    const finalize = harness.service.handleWordCallback(
      configured.id,
      actors[2]!.telegramUserId,
      "final",
      "YES",
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(harness.notifier.sent).toEqual([]);

    release();
    await finalize;
    await flushReactiveEffects();

    const started = harness.getGameById(configured.id);
    const expectedStatusText = context.textsForGame(started).groupInitializationFinished();
    const firstNotification = mustBeDefined(
      harness.notifier.sent[0],
      "Expected first notification",
    );
    const firstPrivateNotificationIndex = harness.notifier.sent.findIndex((entry) =>
      entry.kind.startsWith("private"),
    );
    const groupStatusIndex = harness.notifier.sent.findIndex(
      (entry) => entry.kind === "group-message" && entry.text === expectedStatusText,
    );

    expect(firstNotification.kind).toBe("group-message");
    expect(firstNotification.text).toBe(expectedStatusText);
    expect(firstPrivateNotificationIndex).toBeGreaterThan(groupStatusIndex);
  });
});