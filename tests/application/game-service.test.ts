import { describe, expect, it } from "vitest";
import { OnlyGameCreatorCanCancelError } from "../../src/domain/errors.js";
import { TextService } from "../../src/application/text-service.js";
import { VoteDecision } from "../../src/domain/types.js";
import { createGameServiceHarness } from "./game-service.harness.js";
import {
  SentPrivateKeyboard,
  SentPrivateMessage,
} from "../mocks/fake-notifier.js";
const MANUAL_PAIR_PROMPT_TEXT = new TextService("ru").manualPairPrompt();

const extractPairTargetIds = (
  buttons: Array<Array<{ text: string; data: string }>>,
  gameId: string,
): string[] => {
  const suffix = `:${gameId}`;

  return buttons.flat().map((button) => {
    expect(button.data.startsWith("pair:")).toBe(true);
    expect(button.data.endsWith(suffix)).toBe(true);
    return button.data.slice("pair:".length, -suffix.length);
  });
};

describe("game service", () => {
  it("runs NORMAL + ONLINE + RANDOM happy path to finished state", async () => {
    const harness = createGameServiceHarness();
    const chatId = "chat-core";
    const actors = [
      harness.createActor(1),
      harness.createActor(2),
      harness.createActor(3),
    ];

    const started = await harness.setupNormalOnlineRandomInProgress(
      chatId,
      actors,
    );

    expect(started.stage).toBe("IN_PROGRESS");
    expect(started.config).toEqual({
      mode: "NORMAL",
      playMode: "ONLINE",
      pairingMode: "RANDOM",
    });

    expect(
      harness.notifier.sent.some(
        (entry) =>
          entry.kind === "group-message" &&
          entry.chatId === chatId &&
          entry.text.includes("Все готовы. Игра начинается."),
      ),
    ).toBe(true);

    let game = harness.getGameById(started.id);

    const firstAskerId = game.inProgress.turnOrder[game.inProgress.turnCursor];
    const firstAsker = game.players.find(
      (player) => player.id === firstAskerId,
    );
    expect(firstAsker).toBeDefined();

    await harness.service.handleGroupText(
      chatId,
      firstAsker!.telegramUserId,
      "Question 1",
    );
    await harness.castVoteForAllEligible(game.id, {});

    game = harness.getGameById(game.id);
    expect(game.turns).toHaveLength(1);
    expect(game.turns[0]?.outcome).toBe("NO");

    const secondAskerId = game.inProgress.turnOrder[game.inProgress.turnCursor];
    expect(secondAskerId).not.toBe(firstAskerId);

    const secondAsker = game.players.find(
      (player) => player.id === secondAskerId,
    );
    expect(secondAsker).toBeDefined();

    await harness.service.handleGroupText(
      chatId,
      secondAsker!.telegramUserId,
      "Question 2",
    );

    game = harness.getGameById(game.id);
    const guessedVotes: Record<string, VoteDecision> = {};
    const pending = game.inProgress.pendingVote;
    expect(pending).toBeDefined();

    for (const voterId of pending!.eligibleVoterIds) {
      guessedVotes[voterId] = "GUESSED";
    }

    await harness.castVoteForAllEligible(game.id, guessedVotes);

    game = harness.getGameById(game.id);
    expect(game.turns[1]?.outcome).toBe("GUESSED");

    const activePlayers = game.players.filter(
      (player) => player.stage !== "GUESSED" && player.stage !== "GAVE_UP",
    );
    for (const player of activePlayers) {
      await harness.service.giveUp(chatId, player.telegramUserId);
    }

    const finished = harness.getGameById(game.id);
    expect(finished.stage).toBe("FINISHED");
    expect(finished.result).toBeDefined();
    expect(finished.turns.some((turn) => turn.outcome === "GIVEUP")).toBe(true);

    expect(
      harness.notifier.sent.some(
        (entry) =>
          entry.kind === "group-message" &&
          entry.chatId === chatId &&
          entry.text.includes("Сводка"),
      ),
    ).toBe(true);
  });

  it("runs REVERSE + OFFLINE smoke flow up to first vote transition", async () => {
    const harness = createGameServiceHarness();
    const chatId = "chat-reverse";
    const actors = [
      harness.createActor(1),
      harness.createActor(2),
      harness.createActor(3),
    ];

    const started = await harness.setupReverseOfflineInProgress(chatId, actors);
    expect(started.stage).toBe("IN_PROGRESS");
    expect(started.config).toEqual({
      mode: "REVERSE",
      playMode: "OFFLINE",
      pairingMode: undefined,
    });

    const gameBeforeQuestion = harness.getGameById(started.id);
    const askerId =
      gameBeforeQuestion.inProgress.turnOrder[
        gameBeforeQuestion.inProgress.turnCursor
      ];
    const asker = gameBeforeQuestion.players.find(
      (player) => player.id === askerId,
    );
    expect(asker).toBeDefined();

    const beforeMarker = [
      gameBeforeQuestion.inProgress.currentTargetPlayerId,
      gameBeforeQuestion.inProgress.turnCursor,
      gameBeforeQuestion.inProgress.round,
    ].join(":");

    await harness.service.askOffline(chatId, asker!.telegramUserId);

    const withPendingVote = harness.getGameById(started.id);
    const pendingVote = withPendingVote.inProgress.pendingVote;
    expect(pendingVote).toBeDefined();
    expect(pendingVote?.eligibleVoterIds).toHaveLength(1);

    const targetPlayer = withPendingVote.players.find(
      (player) => player.id === pendingVote!.targetWordOwnerId,
    );
    expect(targetPlayer).toBeDefined();
    expect(
      harness.notifier.sent.some(
        (entry) =>
          entry.kind === "group-keyboard" &&
          entry.chatId === chatId &&
          entry.text.includes(`Отвечает ${targetPlayer!.displayName}`) &&
          entry.buttons[0]?.some((button) => button.text === "Да") &&
          entry.buttons[0]?.some((button) => button.text === "Нет") &&
          entry.buttons[0]?.some((button) => button.text === "Угадал"),
      ),
    ).toBe(true);

    await harness.service.handleVote(
      withPendingVote.id,
      targetPlayer!.telegramUserId,
      "NO",
    );

    const afterVote = harness.getGameById(started.id);
    expect(afterVote.turns).toHaveLength(1);
    expect(afterVote.inProgress.pendingVote).toBeUndefined();

    const afterMarker = [
      afterVote.inProgress.currentTargetPlayerId,
      afterVote.inProgress.turnCursor,
      afterVote.inProgress.round,
    ].join(":");
    expect(afterMarker).not.toBe(beforeMarker);
  });

  it("falls back to group message when creator private chat is blocked during configuration", async () => {
    const harness = createGameServiceHarness();
    const chatId = "chat-dm-config";
    const actors = [
      harness.createActor(1),
      harness.createActor(2),
      harness.createActor(3),
    ];

    harness.notifier.setPrivateKeyboardFailure(actors[0].telegramUserId);

    await harness.service.startGame(chatId, actors[0]);
    await harness.service.joinGame(chatId, actors[1]);
    await harness.service.joinGame(chatId, actors[2]);
    await harness.service.beginConfiguration(chatId, actors[0].telegramUserId);

    const game = harness.getGameByChat(chatId);
    const creator = game.players.find(
      (player) => player.id === game.creatorPlayerId,
    );

    expect(creator?.stage).toBe("BLOCKED_DM");
    expect(
      harness.notifier.sent.some(
        (entry) =>
          entry.kind === "group-message" &&
          entry.chatId === chatId &&
          entry.text.includes(harness.notifier.buildBotDeepLink()),
      ),
    ).toBe(true);
  });

  it("marks player as BLOCKED_DM when private message fails during word collection", async () => {
    const harness = createGameServiceHarness();
    const chatId = "chat-dm-words";
    const actors = [
      harness.createActor(1),
      harness.createActor(2),
      harness.createActor(3),
    ];

    await harness.service.startGame(chatId, actors[0]);
    await harness.service.joinGame(chatId, actors[1]);
    await harness.service.joinGame(chatId, actors[2]);
    await harness.service.beginConfiguration(chatId, actors[0].telegramUserId);

    const game = harness.getGameByChat(chatId);
    harness.notifier.setPrivateMessageFailure(actors[1].telegramUserId);

    await harness.configureGame(
      game.id,
      actors[0].telegramUserId,
      "NORMAL",
      "ONLINE",
      "RANDOM",
    );

    const updated = harness.getGameById(game.id);
    const blockedPlayer = updated.players.find(
      (player) => player.telegramUserId === actors[1].telegramUserId,
    );
    expect(blockedPlayer?.stage).toBe("BLOCKED_DM");

    expect(
      harness.notifier.sent.some(
        (entry) =>
          entry.kind === "group-message" &&
          entry.chatId === chatId &&
          entry.text.includes(harness.notifier.buildBotDeepLink()),
      ),
    ).toBe(true);
  });

  it("allows giveup only in IN_PROGRESS stage", async () => {
    const harness = createGameServiceHarness();
    const chatId = "chat-giveup";
    const actors = [
      harness.createActor(1),
      harness.createActor(2),
      harness.createActor(3),
    ];

    await harness.service.startGame(chatId, actors[0]);
    await harness.service.giveUp(chatId, actors[0].telegramUserId);

    expect(
      harness.notifier.sent.some(
        (entry) =>
          entry.kind === "group-message" &&
          entry.chatId === chatId &&
          entry.text.includes(
            "Команда /giveup доступна только во время игрового этапа.",
          ),
      ),
    ).toBe(true);

    await harness.service.joinGame(chatId, actors[1]);
    await harness.service.joinGame(chatId, actors[2]);
    await harness.service.beginConfiguration(chatId, actors[0].telegramUserId);

    const game = harness.getGameByChat(chatId);
    await harness.configureGame(
      game.id,
      actors[0].telegramUserId,
      "NORMAL",
      "ONLINE",
      "RANDOM",
    );

    for (const actor of actors) {
      await harness.completeWordFlow(
        game.id,
        actor,
        `word-${actor.telegramUserId}`,
      );
    }

    const inProgress = harness.getGameById(game.id);
    expect(inProgress.stage).toBe("IN_PROGRESS");

    const currentAskerId =
      inProgress.inProgress.turnOrder[inProgress.inProgress.turnCursor];
    const currentAsker = inProgress.players.find(
      (player) => player.id === currentAskerId,
    );
    expect(currentAsker).toBeDefined();

    await harness.service.giveUp(chatId, currentAsker!.telegramUserId);

    const updated = harness.getGameById(game.id);
    expect(updated.turns[updated.turns.length - 1]?.outcome).toBe("GIVEUP");
  });

  it("prompts manual pairing queue sequentially and starts word collection only after last choice", async () => {
    const harness = createGameServiceHarness();
    const chatId = "chat-manual-sequence";
    const actors = [
      harness.createActor(1),
      harness.createActor(2),
      harness.createActor(3),
      harness.createActor(4),
    ];

    await harness.service.startGame(chatId, actors[0]);
    for (const actor of actors.slice(1)) {
      await harness.service.joinGame(chatId, actor);
    }

    await harness.service.beginConfiguration(chatId, actors[0].telegramUserId);

    const game = harness.getGameByChat(chatId);
    await harness.configureGame(
      game.id,
      actors[0].telegramUserId,
      "NORMAL",
      "ONLINE",
      "MANUAL",
    );

    const players = harness.getGameById(game.id).players;
    const player1 = players.find(
      (player) => player.telegramUserId === actors[0].telegramUserId,
    )!;
    const player2 = players.find(
      (player) => player.telegramUserId === actors[1].telegramUserId,
    )!;
    const player3 = players.find(
      (player) => player.telegramUserId === actors[2].telegramUserId,
    )!;
    const player4 = players.find(
      (player) => player.telegramUserId === actors[3].telegramUserId,
    )!;

    const pairPromptsAfterConfig = harness.notifier.sent.filter(
      (entry): entry is SentPrivateKeyboard =>
        entry.kind === "private-keyboard" &&
        entry.text === MANUAL_PAIR_PROMPT_TEXT,
    );

    expect(pairPromptsAfterConfig).toHaveLength(1);
    expect(pairPromptsAfterConfig[0]?.userId).toBe(player1.telegramUserId);
    expect(
      extractPairTargetIds(pairPromptsAfterConfig[0].buttons, game.id),
    ).toEqual(expect.arrayContaining([player2.id, player3.id, player4.id]));
    expect(
      extractPairTargetIds(pairPromptsAfterConfig[0].buttons, game.id),
    ).not.toContain(player1.id);

    await harness.service.applyManualPair(
      game.id,
      player1.telegramUserId,
      player2.id,
    );

    const pairPromptsAfterFirstChoice = harness.notifier.sent.filter(
      (entry): entry is SentPrivateKeyboard =>
        entry.kind === "private-keyboard" &&
        entry.text === MANUAL_PAIR_PROMPT_TEXT,
    );

    expect(pairPromptsAfterFirstChoice).toHaveLength(2);
    expect(pairPromptsAfterFirstChoice[1]?.userId).toBe(player2.telegramUserId);
    const secondChooserTargets = extractPairTargetIds(
      pairPromptsAfterFirstChoice[1].buttons,
      game.id,
    );
    expect(secondChooserTargets).not.toContain(player2.id);

    expect(
      harness.notifier.sent.some(
        (entry) =>
          entry.kind === "group-message" &&
          entry.chatId === chatId &&
          entry.text.includes(
            "Ручное распределение завершено. Переходим к вводу слов.",
          ),
      ),
    ).toBe(false);

    await harness.service.applyManualPair(
      game.id,
      player2.telegramUserId,
      player3.id,
    );
    await harness.service.applyManualPair(
      game.id,
      player3.telegramUserId,
      player4.id,
    );
    await harness.service.applyManualPair(
      game.id,
      player4.telegramUserId,
      player1.id,
    );

    const completionMessages = harness.notifier.sent.filter(
      (entry) =>
        entry.kind === "group-message" &&
        entry.chatId === chatId &&
        entry.text.includes(
          "Ручное распределение завершено. Переходим к вводу слов.",
        ),
    );

    expect(completionMessages).toHaveLength(1);

    const wordPrompts = harness.notifier.sent.filter(
      (entry): entry is SentPrivateMessage =>
        entry.kind === "private-message" &&
        entry.text === "Введите слово для игры:",
    );
    expect(wordPrompts).toHaveLength(actors.length);
  });

  it("re-sends current manual pairing prompt on startup recovery", async () => {
    const harness = createGameServiceHarness();
    const chatId = "chat-manual-recovery";
    const actors = [
      harness.createActor(1),
      harness.createActor(2),
      harness.createActor(3),
      harness.createActor(4),
    ];

    await harness.service.startGame(chatId, actors[0]);
    for (const actor of actors.slice(1)) {
      await harness.service.joinGame(chatId, actor);
    }

    await harness.service.beginConfiguration(chatId, actors[0].telegramUserId);

    const game = harness.getGameByChat(chatId);
    await harness.configureGame(
      game.id,
      actors[0].telegramUserId,
      "NORMAL",
      "ONLINE",
      "MANUAL",
    );

    const players = harness.getGameById(game.id).players;
    const player1 = players.find(
      (player) => player.telegramUserId === actors[0].telegramUserId,
    )!;
    const player2 = players.find(
      (player) => player.telegramUserId === actors[1].telegramUserId,
    )!;

    await harness.service.applyManualPair(
      game.id,
      player1.telegramUserId,
      player2.id,
    );

    harness.notifier.sent.length = 0;

    await harness.service.recoverManualPairingPromptsOnStartup();

    const restoredPrompts = harness.notifier.sent.filter(
      (entry): entry is SentPrivateKeyboard =>
        entry.kind === "private-keyboard" &&
        entry.text === MANUAL_PAIR_PROMPT_TEXT,
    );

    expect(restoredPrompts).toHaveLength(1);
    expect(restoredPrompts[0]?.userId).toBe(player2.telegramUserId);

    const targets = extractPairTargetIds(restoredPrompts[0].buttons, game.id);
    expect(targets).not.toContain(player2.id);
  });

  it("allows cancel only for creator", async () => {
    const harness = createGameServiceHarness();
    const chatId = "chat-cancel";
    const actors = [harness.createActor(1), harness.createActor(2)];

    await harness.service.startGame(chatId, actors[0]);
    await harness.service.joinGame(chatId, actors[1]);

    const gameId = harness.getGameByChat(chatId).id;

    await expect(
      harness.service.cancel(chatId, actors[1].telegramUserId),
    ).resolves.toBeInstanceOf(OnlyGameCreatorCanCancelError);

    await harness.service.cancel(chatId, actors[0].telegramUserId);

    const game = harness.getGameById(gameId);
    expect(game.stage).toBe("CANCELED");

    expect(
      harness.notifier.sent.some(
        (entry) =>
          entry.kind === "group-message" &&
          entry.chatId === chatId &&
          entry.text.includes("Игра отменена создателем."),
      ),
    ).toBe(true);
  });
});
