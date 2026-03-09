import { GameState } from "../../domain/types";
import { GameServiceContext } from "../game-service-context";
import { BaseGameModeService } from "./base-game-mode-service";

export class NormalModeService extends BaseGameModeService {
  readonly mode = "NORMAL" as const;

  constructor(context: GameServiceContext) {
    super(context);
  }

  async announceCurrentTurn(game: GameState): Promise<void> {
    const currentAskerId = game.inProgress.turnOrder[game.inProgress.turnCursor];
    if (!currentAskerId) {
      return;
    }

    const label = this.context.playerLabel(game, currentAskerId);
    await this.context.notifier.sendGroupMessage(game.chatId, `Ход игрока ${label}.`);

    if (game.config?.playMode === "OFFLINE") {
      await this.context.notifier.sendGroupKeyboard(
        game.chatId,
        `${label}, нажмите, когда хотите запустить опрос по вопросу.`,
        [[{ text: "Запустить опрос", data: `ask:${game.id}` }]],
      );
    }
  }

  async beforeFirstTurn(game: GameState): Promise<void> {
    for (const player of game.players) {
      const visibleWords = Object.values(game.words)
        .filter((entry) => entry.targetPlayerId !== player.id)
        .map((entry) => `- ${entry.word}${entry.clue ? ` (${entry.clue})` : ""}`)
        .join("\n");

      await this.context.notifier.sendPrivateMessage(
        player.telegramUserId,
        `Список слов других игроков:\n${visibleWords || "(нет данных)"}`,
      );
    }
  }

  async sendFinalSummary(game: GameState): Promise<void> {
    if (!game.result) {
      await this.context.notifier.sendGroupMessage(game.chatId, "Игра завершена.");
      return;
    }

    const lines = (game.result.normal ?? []).map((row) => {
      const crown = row.crowns.length > 0 ? " 👑" : "";
      return `- ${this.context.playerLabel(game, row.playerId)}: ${row.rounds}/${row.questions}${crown}`;
    });

    await this.context.notifier.sendGroupMessage(game.chatId, `Сводка (обычный режим):\n${lines.join("\n")}`);
  }

  protected async startQuestion(gameId: string, actorPlayerId: string, questionText?: string): Promise<void> {
    const updated = this.context.transactionRunner.runInTransaction(() => {
      const current = this.context.requireGameById(gameId);
      const next = this.context.engine.askQuestion(current, {
        actorPlayerId,
        questionText,
        voteId: this.context.idPort.nextId(),
        now: this.context.clock.nowIso(),
      });
      this.context.repository.update(next);
      return next;
    });

    const pending = updated.inProgress.pendingVote;
    if (!pending) {
      return;
    }

    await this.context.notifier.sendGroupKeyboard(
      updated.chatId,
      `${this.context.playerLabel(updated, pending.askerPlayerId)} задал вопрос. Голосуем:`,
      [[
        { text: "Да", data: `vote:YES:${updated.id}` },
        { text: "Нет", data: `vote:NO:${updated.id}` },
        { text: "Угадал", data: `vote:GUESSED:${updated.id}` },
      ]],
    );
  }
}
