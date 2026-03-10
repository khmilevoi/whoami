import type { NotificationError } from "../../domain/errors";
import { GameState } from "../../domain/types";
import type { StartQuestionError } from "../errors";
import { GameServiceContext } from "../game-service-context";
import { BaseGameModeService } from "./base-game-mode-service";

export class ReverseModeService extends BaseGameModeService {
  readonly mode = "REVERSE" as const;

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

    if (game.inProgress.currentTargetPlayerId) {
      const targetLabel = this.context.playerLabel(
        game,
        game.inProgress.currentTargetPlayerId,
      );
      const sentTargetTurn = await this.context.notifier.sendGroupMessage(
        game.chatId,
        this.context.texts.reverseTargetTurn(targetLabel, label),
      );
      if (sentTargetTurn instanceof Error) return sentTargetTurn;
    } else {
      const sentTurn = await this.context.notifier.sendGroupMessage(
        game.chatId,
        this.context.texts.currentTurn(label),
      );
      if (sentTurn instanceof Error) return sentTurn;
    }

    if (game.config?.playMode === "OFFLINE") {
      const sentPrompt = await this.context.notifier.sendGroupKeyboard(
        game.chatId,
        this.context.texts.askOfflinePrompt(label),
        [
          [
            {
              text: this.context.texts.startPollButton(),
              data: `ask:${game.id}`,
            },
          ],
        ],
      );
      if (sentPrompt instanceof Error) return sentPrompt;
    }
  }

  async beforeFirstTurn(_game: GameState): Promise<void> {}

  async sendFinalSummary(game: GameState): Promise<void | NotificationError> {
    if (!game.result) {
      return this.context.notifier.sendGroupMessage(
        game.chatId,
        this.context.texts.gameFinished(),
      );
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

    return this.context.notifier.sendGroupMessage(
      game.chatId,
      this.context.texts.reverseSummary(ownerText, guesserText),
    );
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

    const pending = updated.inProgress.pendingVote;
    if (!pending?.targetWordOwnerId) {
      return;
    }

    const target = updated.players.find(
      (player) => player.id === pending.targetWordOwnerId,
    );
    if (!target) {
      return;
    }

    const sentVote = await this.context.notifier.sendGroupKeyboard(
      updated.chatId,
      this.context.texts.reverseVotePrompt(
        this.context.playerLabel(updated, pending.askerPlayerId),
        this.context.playerLabel(updated, target.id),
      ),
      [
        [
          {
            text: this.context.texts.voteDecisionButton("YES"),
            data: `vote:YES:${updated.id}`,
          },
          {
            text: this.context.texts.voteDecisionButton("NO"),
            data: `vote:NO:${updated.id}`,
          },
          {
            text: this.context.texts.voteDecisionButton("GUESSED"),
            data: `vote:GUESSED:${updated.id}`,
          },
        ],
      ],
    );
    if (sentVote instanceof Error) return sentVote;
  }
}
