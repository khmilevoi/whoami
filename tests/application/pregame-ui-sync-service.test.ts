import { describe, expect, it } from "vitest";
import { GameNotFoundError } from "../../src/domain/errors.js";
import { createGameServiceComponentHarness } from "./game-service-components.harness.js";
import { mustBeDefined } from "../support/strict-helpers.js";

describe("pregame ui sync service", () => {
  it("returns a not-found error when the game does not exist", async () => {
    const components = createGameServiceComponentHarness();

    await expect(components.pregameUiSync.syncGame("missing-game")).resolves.toBeInstanceOf(
      GameNotFoundError,
    );
  });

  it("syncs a configuring game into repository-backed group and private panel state", async () => {
    const components = createGameServiceComponentHarness();
    const actors = components.game.createActors(3);

    await components.game.service.startGame("chat-ui-config", actors[0]!);
    await components.game.service.joinGame("chat-ui-config", actors[1]!);
    await components.game.service.joinGame("chat-ui-config", actors[2]!);
    await components.game.service.beginConfiguration(
      "chat-ui-config",
      actors[0]!.telegramUserId,
    );

    const game = components.game.getGameByChat("chat-ui-config");
    await components.game.service.handlePrivateStart(actors[0]!, {
      action: "open",
      gameId: game.id,
    });
    components.game.notifier.sent.length = 0;

    await components.pregameUiSync.syncGame(game.id);

    const synced = components.game.getGameById(game.id);
    const creator = synced.players[0]!;
    const creatorPanel = mustBeDefined(
      synced.ui?.privatePanels[creator.id],
      "Expected creator private panel state",
    );
    const creatorMessage = mustBeDefined(
      components.game.notifier.sent.find(
        (notification) =>
          notification.kind === "private-keyboard" &&
          notification.userId === creator.telegramUserId,
      ),
      "Expected creator private keyboard",
    );

    expect(synced.ui?.groupStatusMessageId).toBeDefined();
    expect(creatorPanel.chatId).toBe(creator.telegramUserId);
    expect(synced.ui?.privatePanels[synced.players[1]!.id]).toBeUndefined();
    expect(creatorMessage.buttons).toEqual([
      [
        expect.objectContaining({
          kind: "callback",
          data: `ui:open-config:${game.id}`,
        }),
      ],
    ]);
  });

  it("falls back to creating a new group view when editing the old one fails", async () => {
    const components = createGameServiceComponentHarness();
    const actors = components.game.createActors(3);

    await components.game.service.startGame("chat-ui-group-fallback", actors[0]!);
    await components.game.service.joinGame("chat-ui-group-fallback", actors[1]!);
    await components.game.service.joinGame("chat-ui-group-fallback", actors[2]!);
    const game = components.game.getGameByChat("chat-ui-group-fallback");

    await components.pregameUiSync.syncGame(game.id);
    const before = mustBeDefined(
      components.game.getGameById(game.id).ui?.groupStatusMessageId,
      "Expected initial group status message",
    );

    components.game.notifier.sent.length = 0;
    components.game.notifier.setGroupEditFailure(game.chatId);

    await components.pregameUiSync.syncGame(game.id);

    const after = mustBeDefined(
      components.game.getGameById(game.id).ui?.groupStatusMessageId,
      "Expected replacement group status message",
    );

    expect(after).not.toBe(before);
    expect(
      components.game.notifier.sent.some(
        (notification) =>
          notification.kind === "group-message" && notification.messageId === after,
      ),
    ).toBe(true);
  });

  it("marks an opened private panel as blocked when edit and resend both fail", async () => {
    const components = createGameServiceComponentHarness();
    const actors = components.game.createActors(3);

    await components.game.service.startGame("chat-ui-blocked", actors[0]!);
    await components.game.service.joinGame("chat-ui-blocked", actors[1]!);
    await components.game.service.joinGame("chat-ui-blocked", actors[2]!);
    await components.game.service.beginConfiguration(
      "chat-ui-blocked",
      actors[0]!.telegramUserId,
    );

    const game = components.game.getGameByChat("chat-ui-blocked");
    await components.game.service.handlePrivateStart(actors[0]!, {
      action: "open",
      gameId: game.id,
    });
    await components.pregameUiSync.syncGame(game.id);

    components.game.notifier.sent.length = 0;
    components.game.notifier.setPrivateEditFailure(actors[0]!.telegramUserId);
    components.game.notifier.setPrivateKeyboardFailure(actors[0]!.telegramUserId);

    await components.pregameUiSync.syncGame(game.id);

    const updated = components.game.getGameById(game.id);
    expect(updated.players.find((player) => player.id === updated.creatorPlayerId)?.stage).toBe(
      "BLOCKED_DM",
    );
  });

  it("sends plain group and private messages for in-progress views without buttons and skips unopened or blocked players", async () => {
    const components = createGameServiceComponentHarness();
    const actors = components.game.createActors(3);
    const started = await components.game.setupInProgressGame({
      chatId: "chat-ui-plain",
      actors,
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
    });

    const game = components.game.getGameById(started.id);
    game.ui = { privatePanels: {} };
    game.players[0]!.dmOpened = true;
    game.players[1]!.dmOpened = false;
    game.players[2]!.dmOpened = true;
    game.players[2]!.stage = "BLOCKED_DM";
    components.game.repository.update(game);
    components.game.notifier.sent.length = 0;

    await components.pregameUiSync.syncGame(started.id);

    const synced = components.game.getGameById(started.id);
    expect(synced.ui?.groupStatusMessageId).toBeDefined();
    expect(synced.ui?.privatePanels).toEqual({
      "tg:1": expect.objectContaining({ chatId: actors[0]!.telegramUserId }),
    });
    expect(
      components.game.notifier.sent.some(
        (notification) =>
          notification.kind === "group-message" && notification.buttons === undefined,
      ),
    ).toBe(true);
    expect(
      components.game.notifier.sent.some(
        (notification) =>
          notification.kind === "private-message" &&
          notification.userId === actors[0]!.telegramUserId &&
          notification.buttons === undefined,
      ),
    ).toBe(true);
  });

  it("keeps existing message ids when edits succeed without returning a fresh id", async () => {
    const components = createGameServiceComponentHarness();
    const actors = components.game.createActors(3);
    const started = await components.game.setupInProgressGame({
      chatId: "chat-ui-existing-ids",
      actors,
      mode: "REVERSE",
      playMode: "ONLINE",
    });

    const game = components.game.getGameById(started.id);
    game.players[0]!.dmOpened = true;
    game.ui = {
      groupStatusMessageId: 77,
      privatePanels: {
        "tg:1": {
          chatId: actors[0]!.telegramUserId,
          messageId: 88,
        },
      },
    };
    components.game.repository.update(game);
    components.game.notifier.sent.length = 0;
    components.game.notifier.setGroupEditZeroMessageId(game.chatId);
    components.game.notifier.setPrivateEditZeroMessageId(actors[0]!.telegramUserId);

    await components.pregameUiSync.syncGame(started.id);

    const synced = components.game.getGameById(started.id);
    expect(synced.ui?.groupStatusMessageId).toBe(77);
    expect(synced.ui?.privatePanels["tg:1"]?.messageId).toBe(88);
  });

  it("treats unchanged edits as success without resending messages", async () => {
    const components = createGameServiceComponentHarness();
    const actors = components.game.createActors(3);
    const started = await components.game.setupInProgressGame({
      chatId: "chat-ui-unchanged-edits",
      actors,
      mode: "REVERSE",
      playMode: "ONLINE",
    });

    const game = components.game.getGameById(started.id);
    game.players[0]!.dmOpened = true;
    game.ui = {
      groupStatusMessageId: 77,
      privatePanels: {
        "tg:1": {
          chatId: actors[0]!.telegramUserId,
          messageId: 88,
        },
      },
    };
    components.game.repository.update(game);
    components.game.notifier.sent.length = 0;
    components.game.notifier.setGroupEditUnchanged(game.chatId);
    components.game.notifier.setPrivateEditUnchanged(actors[0]!.telegramUserId);

    await components.pregameUiSync.syncGame(started.id);

    const synced = components.game.getGameById(started.id);
    expect(synced.ui?.groupStatusMessageId).toBe(77);
    expect(synced.ui?.privatePanels["tg:1"]?.messageId).toBe(88);
    expect(
      components.game.notifier.sent.filter((notification) => notification.kind === "group-message"),
    ).toHaveLength(0);
    expect(
      components.game.notifier.sent.filter((notification) => notification.kind === "private-message"),
    ).toHaveLength(0);
    expect(
      components.game.notifier.sent.filter((notification) => notification.kind === "private-keyboard"),
    ).toHaveLength(0);
    expect(
      components.game.notifier.sent.filter((notification) => notification.kind === "group-edit"),
    ).toHaveLength(1);
    expect(
      components.game.notifier.sent.filter((notification) => notification.kind === "private-edit"),
    ).toHaveLength(1);
  });

  it("propagates a group-send error without mutating persisted ui state", async () => {
    const components = createGameServiceComponentHarness();
    const actors = components.game.createActors(3);
    const started = await components.game.setupInProgressGame({
      chatId: "chat-ui-send-error",
      actors,
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
    });

    const game = components.game.getGameById(started.id);
    game.ui = { privatePanels: {} };
    components.game.repository.update(game);
    components.game.notifier.sent.length = 0;
    components.game.notifier.setGroupMessageFailure(game.chatId);

    const result = await components.pregameUiSync.syncGame(started.id);

    expect(result).toBeInstanceOf(Error);
    expect(components.game.getGameById(started.id).ui).toEqual({ privatePanels: {} });
    expect(components.game.notifier.sent).toEqual([]);
  });

  it("adds a main-chat link row when the synced group message is linkable", async () => {
    const components = createGameServiceComponentHarness();
    const actors = components.game.createActors(3);

    await components.game.service.startGame("-1002233445566", actors[0]!);
    await components.game.service.joinGame("-1002233445566", actors[1]!);
    await components.game.service.joinGame("-1002233445566", actors[2]!);
    await components.game.service.beginConfiguration("-1002233445566", actors[0]!);

    const game = components.game.getGameByChat("-1002233445566");
    game.players[0]!.dmOpened = true;
    game.ui = { privatePanels: {} };
    components.game.repository.update(game);
    components.game.notifier.sent.length = 0;

    await components.pregameUiSync.syncGame(game.id);

    const panel = mustBeDefined(
      components.game.getGameById(game.id).ui?.privatePanels["tg:1"],
      "Expected creator panel state",
    );
    const notification = mustBeDefined(
      components.game.notifier.sent.find(
        (entry) =>
          entry.kind === "private-keyboard" &&
          entry.userId === actors[0]!.telegramUserId &&
          entry.messageId === panel.messageId,
      ),
      "Expected creator panel notification",
    );

    expect(notification.buttons).toEqual([
      [
        expect.objectContaining({
          kind: "callback",
          data: `ui:open-config:${game.id}`,
        }),
      ],
      [
        expect.objectContaining({
          kind: "url",
          url: expect.stringContaining("https://t.me/c/2233445566/"),
        }),
      ],
    ]);
  });
});
