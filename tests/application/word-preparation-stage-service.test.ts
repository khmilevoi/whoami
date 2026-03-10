import { describe, expect, it } from "vitest";
import { createGameServiceComponentHarness } from "./game-service-components.harness.js";
import {
  SentPrivateKeyboard,
  SentPrivateMessage,
} from "../mocks/fake-notifier.js";
import { mustBeDefined, mustGetAt } from "../support/strict-helpers.js";

describe("word preparation stage service", () => {
  it("reuses the same word/clue/finalization flow for reverse mode", async () => {
    const components = createGameServiceComponentHarness();
    const chatId = "chat-word-flow";
    const actors = [
      components.game.createActor(1),
      components.game.createActor(2),
      components.game.createActor(3),
    ];
    const actor1 = mustGetAt(actors, 0, "Expected first word-flow actor");
    const actor2 = mustGetAt(actors, 1, "Expected second word-flow actor");
    const actor3 = mustGetAt(actors, 2, "Expected third word-flow actor");

    await components.game.service.startGame(chatId, actor1);
    await components.game.service.joinGame(chatId, actor2);
    await components.game.service.joinGame(chatId, actor3);
    await components.game.service.beginConfiguration(
      chatId,
      actor1.telegramUserId,
    );

    const game = components.game.getGameByChat(chatId);
    await components.configurationStage.applyConfigStep(
      game.id,
      actor1.telegramUserId,
      "mode",
      "REVERSE",
    );
    await components.configurationStage.applyConfigStep(
      game.id,
      actor1.telegramUserId,
      "play",
      "OFFLINE",
    );

    await components.wordPreparationStage.handlePrivateText(
      actor1.telegramUserId,
      "planet",
    );

    const confirmPrompt = mustBeDefined(
      components.game.notifier.sent
        .filter(
          (entry): entry is SentPrivateKeyboard =>
            entry.kind === "private-keyboard" &&
            entry.userId === actor1.telegramUserId,
        )
        .at(-1),
      "Expected word confirmation prompt",
    );
    expect(confirmPrompt.text).toContain('Подтвердите слово: "planet"');

    await components.wordPreparationStage.handleWordCallback(
      game.id,
      actor1.telegramUserId,
      "confirm",
      "NO",
    );

    expect(
      components.game.notifier.sent.some(
        (entry) =>
          entry.kind === "private-message" &&
          entry.userId === actor1.telegramUserId &&
          entry.text === "Введите слово заново:",
      ),
    ).toBe(true);

    await components.wordPreparationStage.handlePrivateText(
      actor1.telegramUserId,
      "mars",
    );
    await components.wordPreparationStage.handleWordCallback(
      game.id,
      actor1.telegramUserId,
      "confirm",
      "YES",
    );
    await components.wordPreparationStage.handleWordCallback(
      game.id,
      actor1.telegramUserId,
      "clue",
      "YES",
    );

    expect(
      components.game.notifier.sent.some(
        (entry) =>
          entry.kind === "private-message" &&
          entry.userId === actor1.telegramUserId &&
          entry.text === "Введите пояснение:",
      ),
    ).toBe(true);

    await components.wordPreparationStage.handlePrivateText(
      actor1.telegramUserId,
      "red world",
    );

    const summaryPrompt = mustBeDefined(
      components.game.notifier.sent
        .filter(
          (entry): entry is SentPrivateKeyboard =>
            entry.kind === "private-keyboard" &&
            entry.userId === actor1.telegramUserId,
        )
        .at(-1),
      "Expected word summary prompt",
    );
    expect(summaryPrompt.text).toContain("Слово: mars");
    expect(summaryPrompt.text).toContain("Пояснение: red world");

    await components.wordPreparationStage.handleWordCallback(
      game.id,
      actor1.telegramUserId,
      "final",
      "NO",
    );

    const updated = components.game.getGameById(game.id);
    const updatedPlayer = mustGetAt(
      updated.players,
      0,
      "Expected first updated player after restart",
    );
    expect(updated.words[updatedPlayer.id]?.word).toBeUndefined();
    expect(
      components.game.notifier.sent.some(
        (entry) =>
          entry.kind === "private-message" &&
          entry.userId === actor1.telegramUserId &&
          entry.text === "Ок, заполним слово заново. Введите слово:",
      ),
    ).toBe(true);
  });

  it("starts the game once all players finalize their words", async () => {
    const components = createGameServiceComponentHarness();
    const chatId = "chat-word-ready";
    const actors = [
      components.game.createActor(1),
      components.game.createActor(2),
      components.game.createActor(3),
    ];
    const actor1 = mustGetAt(actors, 0, "Expected first ready actor");
    const actor2 = mustGetAt(actors, 1, "Expected second ready actor");
    const actor3 = mustGetAt(actors, 2, "Expected third ready actor");

    await components.game.service.startGame(chatId, actor1);
    await components.game.service.joinGame(chatId, actor2);
    await components.game.service.joinGame(chatId, actor3);
    await components.game.service.beginConfiguration(
      chatId,
      actor1.telegramUserId,
    );

    const game = components.game.getGameByChat(chatId);
    await components.configurationStage.applyConfigStep(
      game.id,
      actor1.telegramUserId,
      "mode",
      "REVERSE",
    );
    await components.configurationStage.applyConfigStep(
      game.id,
      actor1.telegramUserId,
      "play",
      "OFFLINE",
    );

    for (const actor of actors) {
      await components.wordPreparationStage.handlePrivateText(
        actor.telegramUserId,
        `word-${actor.telegramUserId}`,
      );
      await components.wordPreparationStage.handleWordCallback(
        game.id,
        actor.telegramUserId,
        "confirm",
        "YES",
      );
      await components.wordPreparationStage.handleWordCallback(
        game.id,
        actor.telegramUserId,
        "clue",
        "NO",
      );
      await components.wordPreparationStage.handleWordCallback(
        game.id,
        actor.telegramUserId,
        "final",
        "YES",
      );
    }

    const started = components.game.getGameById(game.id);
    expect(started.stage).toBe("IN_PROGRESS");
    expect(
      components.game.notifier.sent.some(
        (entry) =>
          entry.kind === "group-message" &&
          entry.chatId === chatId &&
          entry.text.includes("Все готовы. Игра начинается."),
      ),
    ).toBe(true);

    const readyMessages = components.game.notifier.sent.filter(
      (entry): entry is SentPrivateMessage =>
        entry.kind === "private-message" &&
        entry.userId === actor1.telegramUserId &&
        entry.text === "Готово. Ожидаем остальных игроков.",
    );
    expect(readyMessages.length).toBeGreaterThan(0);
  });
});
