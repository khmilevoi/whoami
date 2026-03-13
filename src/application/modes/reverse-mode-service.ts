import type { NotificationError } from "../../domain/errors.js";
import { GameState } from "../../domain/types.js";
import type { StartQuestionError } from "../errors.js";
import { GameServiceContext } from "../game-service-context.js";
import { BaseGameModeService } from "./base-game-mode-service.js";

export class ReverseModeService extends BaseGameModeService {
  readonly mode = "REVERSE" as const;

  constructor(context: GameServiceContext) {
    super(context);
  }

  async announceCurrentTurn(
    game: GameState,
  ): Promise<void | NotificationError> {
    const currentAskerId = game.inProgress.turnOrder[game.inProgress.turnCursor];
    if (!currentAskerId) {
      return;
    }

    const texts = this.context.textsForGame(game);
    const label = this.context.playerLabel(game, currentAskerId);

    if (game.inProgress.currentTargetPlayerId) {
      const targetLabel = this.context.playerLabel(
        game,
        game.inProgress.currentTargetPlayerId,
      );
      const sentTargetTurn = await this.context.notifier.sendGroupMessage(
        game.chatId,
        texts.reverseTargetTurn(targetLabel, label),
      );
      if (sentTargetTurn instanceof Error) return sentTargetTurn;
    } else {
      const sentTurn = await this.context.notifier.sendGroupMessage(
        game.chatId,
        texts.currentTurn(label),
      );
      if (sentTurn instanceof Error) return sentTurn;
    }

    if (game.config?.playMode === "OFFLINE") {
      const sentPrompt = await this.context.notifier.sendGroupKeyboard(
        game.chatId,
        texts.askOfflinePrompt(label),
        [
          [
            {
              kind: "callback",
              text: texts.startPollButton(),
              data: `ask:${game.id}`,
              style: "primary",
            },
          ],
        ],
      );
      if (sentPrompt instanceof Error) return sentPrompt;
    }
  }

  async beforeFirstTurn(_game: GameState): Promise<void> {}

  async sendFinalSummary(game: GameState): Promise<void | NotificationError> {
    const texts = this.context.textsForGame(game);
    if (!game.result) {
      const sent = await this.context.notifier.sendGroupMessage(
        game.chatId,
        texts.gameFinished(),
      );
      return sent instanceof Error ? sent : undefined;
    }

    const owner = game.result.reverse?.asWordOwner ?? [];
    const guesser = game.result.reverse?.asGuesser ?? [];

    const ownerText = owner
      .map(
        (row) =>
          `- ${this.context.playerLabel(game, row.playerId)}: ${row.rounds}/${row.questions}${row.crowns.length ? " 👑" : ""}`,
      )
      .join("\n");

    const guesserText = guesser
      .map((row) => {
        const avgRounds = row.avgRounds ?? 0;
        const avgQuestions = row.avgQuestions ?? 0;
        return `- ${this.context.playerLabel(game, row.playerId)}: ${avgRounds}/${avgQuestions}${row.crowns.length ? " 👑" : ""}`;
      })
      .join("\n");

    const sent = await this.context.notifier.sendGroupMessage(
      game.chatId,
      texts.reverseSummary(ownerText, guesserText),
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
