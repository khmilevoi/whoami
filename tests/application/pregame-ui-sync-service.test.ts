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
});
