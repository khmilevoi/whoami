import type { NotificationError } from "../../domain/errors.js";
import { GameState } from "../../domain/types.js";
import type { StartQuestionError } from "../errors.js";
import { GameServiceContext } from "../game-service-context.js";
import { BaseGameModeService } from "./base-game-mode-service.js";

export class NormalModeService extends BaseGameModeService {
  readonly mode = "NORMAL" as const;

  constructor(context: GameServiceContext) {
    super(context);
  }

  async announceCurrentTurn(
    game: GameState,
  ): Promise<void | NotificationError> {
    const currentAskerId =
      game.inProgress.turnOrder[game.inProgress.turnCursor];
    if (!currentAskerId) {
      return;
    }

    const label = this.context.playerLabel(game, currentAskerId);
    const sentTurn = await this.context.notifier.sendGroupMessage(
      game.chatId,
      this.context.texts.currentTurn(label),
    );
    if (sentTurn instanceof Error) return sentTurn;

    if (game.config?.playMode === "OFFLINE") {
      const sentPrompt = await this.context.notifier.sendGroupKeyboard(
        game.chatId,
        this.context.texts.askOfflinePrompt(label),
        [
          [
            {
              kind: "callback",
              text: this.context.texts.startPollButton(),
              data: `ask:${game.id}`,
              style: "primary",
            },
          ],
        ],
      );
      if (sentPrompt instanceof Error) return sentPrompt;
    }
  }

  async beforeFirstTurn(game: GameState): Promise<void> {
    for (const player of game.players) {
      const visibleWords = Object.values(game.words)
        .filter((entry) => entry.targetPlayerId !== player.id)
        .map(
          (entry) => `- ${entry.word}${entry.clue ? ` (${entry.clue})` : ""}`,
        )
        .join("\n");

      await this.context.notifier.sendPrivateMessage(
        player.telegramUserId,
        this.context.texts.otherPlayersWordsList(visibleWords),
      );
    }
  }

  async sendFinalSummary(game: GameState): Promise<void | NotificationError> {
    if (!game.result) {
      const sent = await this.context.notifier.sendGroupMessage(
        game.chatId,
        this.context.texts.gameFinished(),
      );
      return sent instanceof Error ? sent : undefined;
    }

    const lines = (game.result.normal ?? []).map((row) => {
      const crown = row.crowns.length > 0 ? " 👑" : "";
      return `- ${this.context.playerLabel(game, row.playerId)}: ${row.rounds}/${row.questions}${crown}`;
    });

    const sent = await this.context.notifier.sendGroupMessage(
      game.chatId,
      this.context.texts.normalSummary(lines),
    );
    return sent instanceof Error ? sent : undefined;
  }

  protected async startQuestion(
    gameId: string,
    actorPlayerId: string,
    questionText?: string,
  ): Promise<void | StartQuestionError> {
    const updated = this.context.transactionRunner.runInTransaction(() => {
      const current = this.context.getGameByIdOrError(gameId);
      if (current instanceof Error) return current;

      const next = this.context.engine.askQuestion(current, {
        actorPlayerId,
        questionText,
        voteId: this.context.idPort.nextId(),
        now: this.context.clock.nowIso(),
      });
      if (next instanceof Error) return next;

      this.context.repository.update(next);
      return next;
    });
    if (updated instanceof Error) return updated;

    return this.context.publishGameStatus(updated);
  }
}
