import { describe, expect, it } from "vitest";
import { createGameServiceComponentHarness } from "./game-service-components.harness.js";
import {
  SentPrivateKeyboard,
  SentPrivateMessage,
} from "../mocks/fake-notifier.js";
import { mustBeDefined, mustGetAt } from "../support/strict-helpers.js";

describe("configuration stage service", () => {
  it("requests play mode, then pairing mode, then configures normal random game", async () => {
    const components = createGameServiceComponentHarness();
    const chatId = "chat-config-normal";
    const actors = [
      components.game.createActor(1),
      components.game.createActor(2),
      components.game.createActor(3),
    ];
    const creator = mustGetAt(actors, 0, "Expected configuration creator");
    const secondActor = mustGetAt(
      actors,
      1,
      "Expected second configuration actor",
    );
    const thirdActor = mustGetAt(
      actors,
      2,
      "Expected third configuration actor",
    );

    await components.game.service.startGame(chatId, creator);
    await components.game.service.joinGame(chatId, secondActor);
    await components.game.service.joinGame(chatId, thirdActor);
    await components.game.service.beginConfiguration(
      chatId,
      creator.telegramUserId,
    );

    const game = components.game.getGameByChat(chatId);

    await components.configurationStage.applyConfigStep(
      game.id,
      creator.telegramUserId,
      "mode",
      "NORMAL",
    );

    const playPrompt = mustBeDefined(
      components.game.notifier.sent
        .filter(
          (entry): entry is SentPrivateKeyboard =>
            entry.kind === "private-keyboard" &&
            entry.userId === creator.telegramUserId,
        )
        .at(-1),
      "Expected play mode prompt",
    );
    expect(playPrompt.text).toBe("Выберите формат:");

    await components.configurationStage.applyConfigStep(
      game.id,
      creator.telegramUserId,
      "play",
      "ONLINE",
    );

    const pairPrompt = mustBeDefined(
      components.game.notifier.sent
        .filter(
          (entry): entry is SentPrivateKeyboard =>
            entry.kind === "private-keyboard" &&
            entry.userId === creator.telegramUserId,
        )
        .at(-1),
      "Expected pairing prompt",
    );
    expect(pairPrompt.text).toBe("Выберите распределение пар:");

    await components.configurationStage.applyConfigStep(
      game.id,
      creator.telegramUserId,
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
    const creator = mustGetAt(
      actors,
      0,
      "Expected reverse configuration creator",
    );
    const secondActor = mustGetAt(actors, 1, "Expected second reverse actor");
    const thirdActor = mustGetAt(actors, 2, "Expected third reverse actor");

    await components.game.service.startGame(chatId, creator);
    await components.game.service.joinGame(chatId, secondActor);
    await components.game.service.joinGame(chatId, thirdActor);
    await components.game.service.beginConfiguration(
      chatId,
      creator.telegramUserId,
    );

    const game = components.game.getGameByChat(chatId);

    await components.configurationStage.applyConfigStep(
      game.id,
      creator.telegramUserId,
      "mode",
      "REVERSE",
    );
    await components.configurationStage.applyConfigStep(
      game.id,
      creator.telegramUserId,
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
