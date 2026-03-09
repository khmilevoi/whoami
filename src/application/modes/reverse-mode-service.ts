import { GameState } from "../../domain/types";
import { GameServiceContext } from "../game-service-context";
import { BaseGameModeService } from "./base-game-mode-service";

export class ReverseModeService extends BaseGameModeService {
  readonly mode = "REVERSE" as const;

  constructor(context: GameServiceContext) {
    super(context);
  }

  async announceCurrentTurn(game: GameState): Promise<void> {
    const currentAskerId = game.inProgress.turnOrder[game.inProgress.turnCursor];
    if (!currentAskerId) {
      return;
    }

    const label = this.context.playerLabel(game, currentAskerId);

    if (game.inProgress.currentTargetPlayerId) {
      const targetLabel = this.context.playerLabel(game, game.inProgress.currentTargetPlayerId);
      await this.context.notifier.sendGroupMessage(
        game.chatId,
        `Сейчас угадываем слово игрока ${targetLabel}. Ход задавать вопрос у ${label}.`,
      );
    } else {
      await this.context.notifier.sendGroupMessage(game.chatId, `Ход игрока ${label}.`);
    }

    if (game.config?.playMode === "OFFLINE") {
      await this.context.notifier.sendGroupKeyboard(
        game.chatId,
        `${label}, нажмите, когда хотите запустить опрос по вопросу.`,
        [[{ text: "Запустить опрос", data: `ask:${game.id}` }]],
      );
    }
  }

  async beforeFirstTurn(_game: GameState): Promise<void> {}

  async sendFinalSummary(game: GameState): Promise<void> {
    if (!game.result) {
      await this.context.notifier.sendGroupMessage(game.chatId, "Игра завершена.");
      return;
    }

    const owner = game.result.reverse?.asWordOwner ?? [];
    const guesser = game.result.reverse?.asGuesser ?? [];

    const ownerText = owner
      .map((row) => `- ${this.context.playerLabel(game, row.playerId)}: ${row.rounds}/${row.questions}${row.crowns.length ? " 👑" : ""}`)
      .join("\n");

    const guesserText = guesser
      .map((row) => {
        const avgRounds = row.avgRounds ?? 0;
        const avgQuestions = row.avgQuestions ?? 0;
        return `- ${this.context.playerLabel(game, row.playerId)}: ${avgRounds}/${avgQuestions}${row.crowns.length ? " 👑" : ""}`;
      })
      .join("\n");

    await this.context.notifier.sendGroupMessage(
      game.chatId,
      `Сводка (обратный режим):\nЗагадывали:\n${ownerText || "-"}\n\nУгадывали:\n${guesserText || "-"}`,
    );
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
    if (!pending?.targetWordOwnerId) {
      return;
    }

    const target = updated.players.find((player) => player.id === pending.targetWordOwnerId);
    if (!target) {
      return;
    }

    await this.context.notifier.sendGroupKeyboard(
      updated.chatId,
      `${this.context.playerLabel(updated, pending.askerPlayerId)} задал вопрос. Отвечает ${this.context.playerLabel(updated, target.id)}:`,
      [[
        { text: "Да", data: `vote:YES:${updated.id}` },
        { text: "Нет", data: `vote:NO:${updated.id}` },
        { text: "Угадал", data: `vote:GUESSED:${updated.id}` },
      ]],
    );
  }
}

