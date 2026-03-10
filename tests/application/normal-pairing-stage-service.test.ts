import { describe, expect, it } from "vitest";
import { createGameServiceComponentHarness } from "./game-service-components.harness.js";
import {
  SentPrivateKeyboard,
  SentPrivateMessage,
} from "../mocks/fake-notifier.js";
import { TextService } from "../../src/application/text-service.js";
import { mustBeDefined, mustGetAt } from "../support/strict-helpers.js";

const MANUAL_PAIR_PROMPT_TEXT = new TextService("ru").manualPairPrompt();

const extractPairTargetIds = (
  buttons: Array<Array<{ text: string; data: string }>>,
  gameId: string,
): string[] => {
  const suffix = `:${gameId}`;
  return buttons
    .flat()
    .map((button) => button.data.slice("pair:".length, -suffix.length));
};

describe("normal pairing stage service", () => {
  it("prompts choosers sequentially and starts word collection after the final selection", async () => {
    const components = createGameServiceComponentHarness();
    const chatId = "chat-pairing-sequence";
    const actors = [
      components.game.createActor(1),
      components.game.createActor(2),
      components.game.createActor(3),
      components.game.createActor(4),
    ];
    const actor1 = mustGetAt(actors, 0, "Expected first manual pairing actor");
    const actor2 = mustGetAt(actors, 1, "Expected second manual pairing actor");
    const actor3 = mustGetAt(actors, 2, "Expected third manual pairing actor");
    const actor4 = mustGetAt(actors, 3, "Expected fourth manual pairing actor");

    await components.game.service.startGame(chatId, actor1);
    for (const actor of actors.slice(1)) {
      await components.game.service.joinGame(chatId, actor);
    }
    await components.game.service.beginConfiguration(
      chatId,
      actor1.telegramUserId,
    );

    const game = components.game.getGameByChat(chatId);
    await components.configurationStage.applyConfigStep(
      game.id,
      actor1.telegramUserId,
      "mode",
      "NORMAL",
    );
    await components.configurationStage.applyConfigStep(
      game.id,
      actor1.telegramUserId,
      "play",
      "ONLINE",
    );
    await components.configurationStage.applyConfigStep(
      game.id,
      actor1.telegramUserId,
      "pair",
      "MANUAL",
    );

    const players = components.game.getGameById(game.id).players;
    const player1 = mustBeDefined(
      players.find((player) => player.telegramUserId === actor1.telegramUserId),
      "Expected first player",
    );
    const player2 = mustBeDefined(
      players.find((player) => player.telegramUserId === actor2.telegramUserId),
      "Expected second player",
    );
    const player3 = mustBeDefined(
      players.find((player) => player.telegramUserId === actor3.telegramUserId),
      "Expected third player",
    );
    const player4 = mustBeDefined(
      players.find((player) => player.telegramUserId === actor4.telegramUserId),
      "Expected fourth player",
    );

    const prompts = components.game.notifier.sent.filter(
      (entry): entry is SentPrivateKeyboard =>
        entry.kind === "private-keyboard" &&
        entry.text === MANUAL_PAIR_PROMPT_TEXT,
    );
    const firstPrompt = mustGetAt(
      prompts,
      0,
      "Expected first manual pairing prompt",
    );
    expect(prompts).toHaveLength(1);
    expect(firstPrompt.userId).toBe(player1.telegramUserId);
    expect(extractPairTargetIds(firstPrompt.buttons, game.id)).not.toContain(
      player1.id,
    );

    await components.normalPairingStage.applyManualPair(
      game.id,
      player1.telegramUserId,
      player2.id,
    );
    await components.normalPairingStage.applyManualPair(
      game.id,
      player2.telegramUserId,
      player3.id,
    );
    await components.normalPairingStage.applyManualPair(
      game.id,
      player3.telegramUserId,
      player4.id,
    );
    await components.normalPairingStage.applyManualPair(
      game.id,
      player4.telegramUserId,
      player1.id,
    );

    expect(
      components.game.notifier.sent.some(
        (entry) =>
          entry.kind === "group-message" &&
          entry.chatId === chatId &&
          entry.text.includes(
            "Ручное распределение завершено. Переходим к вводу слов.",
          ),
      ),
    ).toBe(true);

    const wordPrompts = components.game.notifier.sent.filter(
      (entry): entry is SentPrivateMessage =>
        entry.kind === "private-message" &&
        entry.text === "Введите слово для игры:",
    );
    expect(wordPrompts).toHaveLength(actors.length);
  });

  it("re-sends the current chooser prompt during recovery", async () => {
    const components = createGameServiceComponentHarness();
    const chatId = "chat-pairing-recovery";
    const actors = [
      components.game.createActor(1),
      components.game.createActor(2),
      components.game.createActor(3),
      components.game.createActor(4),
    ];
    const actor1 = mustGetAt(actors, 0, "Expected first recovery actor");
    const actor2 = mustGetAt(actors, 1, "Expected second recovery actor");

    await components.game.service.startGame(chatId, actor1);
    for (const actor of actors.slice(1)) {
      await components.game.service.joinGame(chatId, actor);
    }
    await components.game.service.beginConfiguration(
      chatId,
      actor1.telegramUserId,
    );

    const game = components.game.getGameByChat(chatId);
    await components.configurationStage.applyConfigStep(
      game.id,
      actor1.telegramUserId,
      "mode",
      "NORMAL",
    );
    await components.configurationStage.applyConfigStep(
      game.id,
      actor1.telegramUserId,
      "play",
      "ONLINE",
    );
    await components.configurationStage.applyConfigStep(
      game.id,
      actor1.telegramUserId,
      "pair",
      "MANUAL",
    );

    const players = components.game.getGameById(game.id).players;
    const player1 = mustBeDefined(
      players.find((player) => player.telegramUserId === actor1.telegramUserId),
      "Expected recovery player one",
    );
    const player2 = mustBeDefined(
      players.find((player) => player.telegramUserId === actor2.telegramUserId),
      "Expected recovery player two",
    );

    await components.normalPairingStage.applyManualPair(
      game.id,
      player1.telegramUserId,
      player2.id,
    );
    components.game.notifier.sent.length = 0;

    await components.normalPairingStage.recoverPromptsOnStartup();

    const prompts = components.game.notifier.sent.filter(
      (entry): entry is SentPrivateKeyboard =>
        entry.kind === "private-keyboard" &&
        entry.text === MANUAL_PAIR_PROMPT_TEXT,
    );
    const restoredPrompt = mustGetAt(
      prompts,
      0,
      "Expected restored pairing prompt",
    );
    expect(prompts).toHaveLength(1);
    expect(restoredPrompt.userId).toBe(player2.telegramUserId);
    expect(extractPairTargetIds(restoredPrompt.buttons, game.id)).not.toContain(
      player2.id,
    );
  });
});
