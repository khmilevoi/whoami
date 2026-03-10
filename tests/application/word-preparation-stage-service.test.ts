import { describe, expect, it } from "vitest";
import { createGameServiceComponentHarness } from "./game-service-components.harness";
import {
  SentPrivateKeyboard,
  SentPrivateMessage,
} from "../mocks/fake-notifier";

describe("word preparation stage service", () => {
  it("reuses the same word/clue/finalization flow for reverse mode", async () => {
    const components = createGameServiceComponentHarness();
    const chatId = "chat-word-flow";
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

    await components.wordPreparationStage.handlePrivateText(
      actors[0].telegramUserId,
      "planet",
    );

    const confirmPrompt = components.game.notifier.sent
      .filter(
        (entry): entry is SentPrivateKeyboard =>
          entry.kind === "private-keyboard" &&
          entry.userId === actors[0].telegramUserId,
      )
      .at(-1);
    expect(confirmPrompt?.text).toContain('Подтвердите слово: "planet"');

    await components.wordPreparationStage.handleWordCallback(
      game.id,
      actors[0].telegramUserId,
      "confirm",
      "NO",
    );

    expect(
      components.game.notifier.sent.some(
        (entry) =>
          entry.kind === "private-message" &&
          entry.userId === actors[0].telegramUserId &&
          entry.text === "Введите слово заново:",
      ),
    ).toBe(true);

    await components.wordPreparationStage.handlePrivateText(
      actors[0].telegramUserId,
      "mars",
    );
    await components.wordPreparationStage.handleWordCallback(
      game.id,
      actors[0].telegramUserId,
      "confirm",
      "YES",
    );
    await components.wordPreparationStage.handleWordCallback(
      game.id,
      actors[0].telegramUserId,
      "clue",
      "YES",
    );

    expect(
      components.game.notifier.sent.some(
        (entry) =>
          entry.kind === "private-message" &&
          entry.userId === actors[0].telegramUserId &&
          entry.text === "Введите пояснение:",
      ),
    ).toBe(true);

    await components.wordPreparationStage.handlePrivateText(
      actors[0].telegramUserId,
      "red world",
    );

    const summaryPrompt = components.game.notifier.sent
      .filter(
        (entry): entry is SentPrivateKeyboard =>
          entry.kind === "private-keyboard" &&
          entry.userId === actors[0].telegramUserId,
      )
      .at(-1);
    expect(summaryPrompt?.text).toContain("Слово: mars");
    expect(summaryPrompt?.text).toContain("Пояснение: red world");

    await components.wordPreparationStage.handleWordCallback(
      game.id,
      actors[0].telegramUserId,
      "final",
      "NO",
    );

    const updated = components.game.getGameById(game.id);
    expect(updated.words[updated.players[0].id]?.word).toBeUndefined();
    expect(
      components.game.notifier.sent.some(
        (entry) =>
          entry.kind === "private-message" &&
          entry.userId === actors[0].telegramUserId &&
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
        entry.userId === actors[0].telegramUserId &&
        entry.text === "Готово. Ожидаем остальных игроков.",
    );
    expect(readyMessages.length).toBeGreaterThan(0);
  });
});
