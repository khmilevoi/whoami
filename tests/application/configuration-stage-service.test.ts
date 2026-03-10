import { describe, expect, it } from "vitest";
import { createGameServiceComponentHarness } from "./game-service-components.harness";
import {
  SentPrivateKeyboard,
  SentPrivateMessage,
} from "../mocks/fake-notifier";

describe("configuration stage service", () => {
  it("requests play mode, then pairing mode, then configures normal random game", async () => {
    const components = createGameServiceComponentHarness();
    const chatId = "chat-config-normal";
    const actors = [
      components.game.createActor(1),
      components.game.createActor(2),
      components.game.createActor(3),
    ];

    await components.game.service.startGame(chatId, actors[0]);
    await components.game.service.joinGame(chatId, actors[1]);
    await components.game.service.joinGame(chatId, actors[2]);
    await components.game.service.beginConfiguration(
      chatId,
      actors[0].telegramUserId,
    );

    const game = components.game.getGameByChat(chatId);

    await components.configurationStage.applyConfigStep(
      game.id,
      actors[0].telegramUserId,
      "mode",
      "NORMAL",
    );

    const playPrompt = components.game.notifier.sent
      .filter(
        (entry): entry is SentPrivateKeyboard =>
          entry.kind === "private-keyboard" &&
          entry.userId === actors[0].telegramUserId,
      )
      .at(-1);
    expect(playPrompt?.text).toBe("Выберите формат:");

    await components.configurationStage.applyConfigStep(
      game.id,
      actors[0].telegramUserId,
      "play",
      "ONLINE",
    );

    const pairPrompt = components.game.notifier.sent
      .filter(
        (entry): entry is SentPrivateKeyboard =>
          entry.kind === "private-keyboard" &&
          entry.userId === actors[0].telegramUserId,
      )
      .at(-1);
    expect(pairPrompt?.text).toBe("Выберите распределение пар:");

    await components.configurationStage.applyConfigStep(
      game.id,
      actors[0].telegramUserId,
      "pair",
      "RANDOM",
    );

    const configured = components.game.getGameById(game.id);
    expect(configured.config).toEqual({
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
    });

    const wordPrompts = components.game.notifier.sent.filter(
      (entry): entry is SentPrivateMessage =>
        entry.kind === "private-message" &&
        entry.text === "Введите слово для игры:",
    );
    expect(wordPrompts).toHaveLength(actors.length);
  });

  it("skips pairing step for reverse mode and starts word collection immediately", async () => {
    const components = createGameServiceComponentHarness();
    const chatId = "chat-config-reverse";
    const actors = [
      components.game.createActor(1),
      components.game.createActor(2),
      components.game.createActor(3),
    ];

    await components.game.service.startGame(chatId, actors[0]);
    await components.game.service.joinGame(chatId, actors[1]);
    await components.game.service.joinGame(chatId, actors[2]);
    await components.game.service.beginConfiguration(
      chatId,
      actors[0].telegramUserId,
    );

    const game = components.game.getGameByChat(chatId);

    await components.configurationStage.applyConfigStep(
      game.id,
      actors[0].telegramUserId,
      "mode",
      "REVERSE",
    );
    await components.configurationStage.applyConfigStep(
      game.id,
      actors[0].telegramUserId,
      "play",
      "OFFLINE",
    );

    const configured = components.game.getGameById(game.id);
    expect(configured.config).toEqual({
      mode: "REVERSE",
      playMode: "OFFLINE",
      pairingMode: undefined,
    });
    expect(Object.keys(configured.words)).toHaveLength(actors.length);

    expect(
      components.game.notifier.sent.some(
        (entry) =>
          entry.kind === "private-keyboard" &&
          entry.text === "Выберите распределение пар:",
      ),
    ).toBe(false);
  });
});
