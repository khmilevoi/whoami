import { describe, expect, it } from "vitest";
import { createGameServiceComponentHarness } from "./game-service-components.harness";
import { SentPrivateKeyboard, SentPrivateMessage } from "../mocks/fake-notifier";
import { TextService } from "../../src/application/text-service";

const MANUAL_PAIR_PROMPT_TEXT = new TextService("ru").manualPairPrompt();

const extractPairTargetIds = (buttons: Array<Array<{ text: string; data: string }>>, gameId: string): string[] => {
  const suffix = `:${gameId}`;
  return buttons.flat().map((button) => button.data.slice("pair:".length, -suffix.length));
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

    await components.game.service.startGame(chatId, actors[0]);
    for (const actor of actors.slice(1)) {
      await components.game.service.joinGame(chatId, actor);
    }
    await components.game.service.beginConfiguration(chatId, actors[0].telegramUserId);

    const game = components.game.getGameByChat(chatId);
    await components.configurationStage.applyConfigStep(game.id, actors[0].telegramUserId, "mode", "NORMAL");
    await components.configurationStage.applyConfigStep(game.id, actors[0].telegramUserId, "play", "ONLINE");
    await components.configurationStage.applyConfigStep(game.id, actors[0].telegramUserId, "pair", "MANUAL");

    const players = components.game.getGameById(game.id).players;
    const player1 = players.find((player) => player.telegramUserId === actors[0].telegramUserId)!;
    const player2 = players.find((player) => player.telegramUserId === actors[1].telegramUserId)!;
    const player3 = players.find((player) => player.telegramUserId === actors[2].telegramUserId)!;
    const player4 = players.find((player) => player.telegramUserId === actors[3].telegramUserId)!;

    const prompts = components.game.notifier.sent.filter(
      (entry): entry is SentPrivateKeyboard => entry.kind === "private-keyboard" && entry.text === MANUAL_PAIR_PROMPT_TEXT,
    );
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.userId).toBe(player1.telegramUserId);
    expect(extractPairTargetIds(prompts[0]!.buttons, game.id)).not.toContain(player1.id);

    await components.normalPairingStage.applyManualPair(game.id, player1.telegramUserId, player2.id);
    await components.normalPairingStage.applyManualPair(game.id, player2.telegramUserId, player3.id);
    await components.normalPairingStage.applyManualPair(game.id, player3.telegramUserId, player4.id);
    await components.normalPairingStage.applyManualPair(game.id, player4.telegramUserId, player1.id);

    expect(
      components.game.notifier.sent.some(
        (entry) =>
          entry.kind === "group-message" &&
          entry.chatId === chatId &&
          entry.text.includes("Ручное распределение завершено. Переходим к вводу слов."),
      ),
    ).toBe(true);

    const wordPrompts = components.game.notifier.sent.filter(
      (entry): entry is SentPrivateMessage => entry.kind === "private-message" && entry.text === "Введите слово для игры:",
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

    await components.game.service.startGame(chatId, actors[0]);
    for (const actor of actors.slice(1)) {
      await components.game.service.joinGame(chatId, actor);
    }
    await components.game.service.beginConfiguration(chatId, actors[0].telegramUserId);

    const game = components.game.getGameByChat(chatId);
    await components.configurationStage.applyConfigStep(game.id, actors[0].telegramUserId, "mode", "NORMAL");
    await components.configurationStage.applyConfigStep(game.id, actors[0].telegramUserId, "play", "ONLINE");
    await components.configurationStage.applyConfigStep(game.id, actors[0].telegramUserId, "pair", "MANUAL");

    const players = components.game.getGameById(game.id).players;
    const player1 = players.find((player) => player.telegramUserId === actors[0].telegramUserId)!;
    const player2 = players.find((player) => player.telegramUserId === actors[1].telegramUserId)!;

    await components.normalPairingStage.applyManualPair(game.id, player1.telegramUserId, player2.id);
    components.game.notifier.sent.length = 0;

    await components.normalPairingStage.recoverPromptsOnStartup();

    const prompts = components.game.notifier.sent.filter(
      (entry): entry is SentPrivateKeyboard => entry.kind === "private-keyboard" && entry.text === MANUAL_PAIR_PROMPT_TEXT,
    );
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.userId).toBe(player2.telegramUserId);
    expect(extractPairTargetIds(prompts[0]!.buttons, game.id)).not.toContain(player2.id);
  });
});
