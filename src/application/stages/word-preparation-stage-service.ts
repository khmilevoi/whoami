import { GameState } from "../../domain/types";
import { GameServiceContext } from "../game-service-context";
import { PrivateExpectationStore } from "../stores/private-expectation-store";
import { ReadyStartStageService } from "./ready-start-stage-service";

export class WordPreparationStageService {
  constructor(
    private readonly context: GameServiceContext,
    private readonly expectationStore: PrivateExpectationStore,
    private readonly readyStartStage: ReadyStartStageService,
  ) {}

  async handlePrivateText(telegramUserId: string, text: string): Promise<void> {
    const game = this.context.findActiveGameByTelegramUser(telegramUserId);
    if (!game) {
      return;
    }

    const player = this.context.requirePlayerByTelegram(game, telegramUserId);
    const expected = this.expectationStore.get(game.id, player.id) ?? "WORD";

    if (game.stage !== "PREPARE_WORDS" && game.stage !== "READY_WAIT") {
      return;
    }

    if (!game.words[player.id]) {
      await this.context.notifier.sendPrivateMessage(telegramUserId, "Ожидайте завершения распределения пар.");
      return;
    }

    if (expected === "CLUE") {
      const updated = this.context.transactionRunner.runInTransaction(() => {
        const current = this.context.requireGameById(game.id);
        const next = this.context.engine.submitClue(current, player.id, text, this.context.clock.nowIso());
        this.context.repository.update(next);
        return next;
      });

      this.expectationStore.delete(game.id, player.id);
      await this.sendWordSummary(updated, player.id);
      return;
    }

    const updated = this.context.transactionRunner.runInTransaction(() => {
      const current = this.context.requireGameById(game.id);
      const next = this.context.engine.submitWord(current, player.id, text, this.context.clock.nowIso());
      this.context.repository.update(next);
      return next;
    });

    await this.context.notifier.sendPrivateKeyboard(
      telegramUserId,
      `Подтвердите слово: "${updated.words[player.id].word}"`,
      [[{ text: "Да", data: `word:confirm:YES:${game.id}` }, { text: "Нет", data: `word:confirm:NO:${game.id}` }]],
    );
  }

  async handleWordCallback(
    gameId: string,
    telegramUserId: string,
    action: "confirm" | "clue" | "final",
    value: "YES" | "NO",
  ): Promise<void> {
    const playerGame = this.context.requireGameById(gameId);
    const player = this.context.requirePlayerByTelegram(playerGame, telegramUserId);

    if (action === "confirm") {
      const updated = this.context.transactionRunner.runInTransaction(() => {
        const current = this.context.requireGameById(gameId);
        const next = this.context.engine.confirmWord(current, player.id, value === "YES", this.context.clock.nowIso());
        this.context.repository.update(next);
        return next;
      });

      if (value === "NO") {
        this.expectationStore.set(gameId, player.id, "WORD");
        await this.context.notifier.sendPrivateMessage(telegramUserId, "Введите слово заново:");
        return;
      }

      await this.context.notifier.sendPrivateKeyboard(
        telegramUserId,
        "Добавить пояснение к слову?",
        [[{ text: "Да", data: `word:clue:YES:${gameId}` }, { text: "Нет", data: `word:clue:NO:${gameId}` }]],
      );

      await this.sendWordSummary(updated, player.id, false);
      return;
    }

    if (action === "clue") {
      if (value === "YES") {
        this.expectationStore.set(gameId, player.id, "CLUE");
        await this.context.notifier.sendPrivateMessage(telegramUserId, "Введите пояснение:");
        return;
      }

      const updated = this.context.transactionRunner.runInTransaction(() => {
        const current = this.context.requireGameById(gameId);
        const next = this.context.engine.submitClue(current, player.id, undefined, this.context.clock.nowIso());
        this.context.repository.update(next);
        return next;
      });

      this.expectationStore.delete(gameId, player.id);
      await this.sendWordSummary(updated, player.id);
      return;
    }

    const updated = this.context.transactionRunner.runInTransaction(() => {
      const current = this.context.requireGameById(gameId);
      const next = this.context.engine.finalizeWord(current, player.id, value === "YES", this.context.clock.nowIso());
      this.context.repository.update(next);
      return next;
    });

    if (value === "NO") {
      this.expectationStore.set(gameId, player.id, "WORD");
      await this.context.notifier.sendPrivateMessage(telegramUserId, "Ок, заполним слово заново. Введите слово:");
      return;
    }

    this.expectationStore.delete(gameId, player.id);
    await this.context.notifier.sendPrivateMessage(telegramUserId, "Готово. Ожидаем остальных игроков.");
    await this.readyStartStage.tryStartGame(updated.id);
  }

  async promptWordCollection(game: GameState): Promise<void> {
    for (const player of game.players) {
      const ok = await this.context.notifier.sendPrivateMessage(player.telegramUserId, "Введите слово для игры:");
      if (!ok) {
        this.context.transactionRunner.runInTransaction(() => {
          const current = this.context.requireGameById(game.id);
          this.context.engine.markDmBlocked(current, player.id, this.context.clock.nowIso());
          this.context.repository.update(current);
        });

        await this.context.notifier.sendGroupMessage(
          game.chatId,
          `${this.context.playerLabel(game, player.id)} не открыл ЛС. Ссылка: ${this.context.notifier.buildBotDeepLink()}`,
        );
      }

      this.expectationStore.set(game.id, player.id, "WORD");
    }
  }

  async sendWordSummary(game: GameState, playerId: string, includeButtons = true): Promise<void> {
    const player = game.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      return;
    }

    const entry = game.words[playerId];
    if (!entry) {
      return;
    }

    const text = [
      `Слово: ${entry.word ?? "-"}`,
      `Пояснение: ${entry.clue ?? "(нет)"}`,
      "Подтвердить?",
    ].join("\n");

    if (!includeButtons) {
      await this.context.notifier.sendPrivateMessage(player.telegramUserId, text);
      return;
    }

    await this.context.notifier.sendPrivateKeyboard(
      player.telegramUserId,
      text,
      [[{ text: "Подтвердить", data: `word:final:YES:${game.id}` }, { text: "Редактировать", data: `word:final:NO:${game.id}` }]],
    );
  }
}
