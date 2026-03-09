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
      await this.context.notifier.sendGroupMessage(game.chatId, this.context.texts.reverseTargetTurn(targetLabel, label));
    } else {
      await this.context.notifier.sendGroupMessage(game.chatId, this.context.texts.currentTurn(label));
    }

    if (game.config?.playMode === "OFFLINE") {
      await this.context.notifier.sendGroupKeyboard(
        game.chatId,
        this.context.texts.askOfflinePrompt(label),
        [[{ text: this.context.texts.startPollButton(), data: `ask:${game.id}` }]],
      );
    }
  }

  async beforeFirstTurn(_game: GameState): Promise<void> {}

  async sendFinalSummary(game: GameState): Promise<void> {
    if (!game.result) {
      await this.context.notifier.sendGroupMessage(game.chatId, this.context.texts.gameFinished());
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

    await this.context.notifier.sendGroupMessage(game.chatId, this.context.texts.reverseSummary(ownerText, guesserText));
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
      this.context.texts.reverseVotePrompt(
        this.context.playerLabel(updated, pending.askerPlayerId),
        this.context.playerLabel(updated, target.id),
      ),
      [[
        { text: this.context.texts.voteDecisionButton("YES"), data: `vote:YES:${updated.id}` },
        { text: this.context.texts.voteDecisionButton("NO"), data: `vote:NO:${updated.id}` },
        { text: this.context.texts.voteDecisionButton("GUESSED"), data: `vote:GUESSED:${updated.id}` },
      ]],
    );
  }
}
