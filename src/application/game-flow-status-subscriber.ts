import type { NotificationError } from "../domain/errors.js";
import { GameMode, GameState } from "../domain/types.js";
import { GameStatusSubscriber, GameStatusTransition } from "./game-status-service.js";
import { GameServiceContext } from "./game-service-context.js";
import { GameModeService } from "./modes/game-mode-service.js";

export class GameFlowStatusSubscriber implements GameStatusSubscriber {
  private readonly modeServices = new Map<GameMode, GameModeService>();

  constructor(
    private readonly context: GameServiceContext,
    services: GameModeService[],
  ) {
    for (const service of services) {
      this.modeServices.set(service.mode, service);
    }
  }

  async onGameStatusChanged(
    transition: GameStatusTransition,
  ): Promise<void | Error> {
    const gameId = transition.current?.gameId ?? transition.previous?.gameId;
    if (!gameId) {
      return;
    }

    const game = this.context.getGameByIdOrError(gameId);
    if (game instanceof Error) {
      return game;
    }

    const texts = this.context.textsForGame(game);

    if (transition.changed.stageChanged && transition.current?.stage === "CANCELED") {
      const sentCancel = await this.context.notifier.sendGroupMessage(
        game.chatId,
        texts.gameCancelledByCreator(),
      );
      return sentCancel instanceof Error ? sentCancel : undefined;
    }

    if (!game.config) {
      return;
    }

    if (
      transition.changed.stageChanged &&
      transition.current?.stage === "IN_PROGRESS"
    ) {
      const modeService = this.modeServices.get(game.config.mode);
      if (!modeService) {
        return;
      }

      await modeService.beforeFirstTurn(game);
      const sentStart = await this.context.notifier.sendGroupMessage(
        game.chatId,
        texts.allReadyGameStarts(),
      );
      if (sentStart instanceof Error) return sentStart;
      return modeService.announceCurrentTurn(game);
    }

    if (
      transition.changed.pendingVoteChanged &&
      transition.current?.hasPendingVote
    ) {
      return this.sendPendingVotePrompt(game);
    }

    const lastTurnChanged =
      transition.previous?.lastTurnOutcome !== transition.current?.lastTurnOutcome ||
      transition.previous?.lastTurnAskerPlayerId !==
        transition.current?.lastTurnAskerPlayerId;
    if (lastTurnChanged && transition.current?.lastTurnOutcome) {
      const lastOutcome = transition.current.lastTurnOutcome;
      const lastAskerId = transition.current.lastTurnAskerPlayerId;

      if (lastOutcome === "GIVEUP" && lastAskerId) {
        const sentGiveUp = await this.context.notifier.sendGroupMessage(
          game.chatId,
          texts.playerGaveUp(this.context.playerLabel(game, lastAskerId)),
        );
        if (sentGiveUp instanceof Error) return sentGiveUp;
      } else {
        const sentSummary = await this.context.notifier.sendGroupMessage(
          game.chatId,
          texts.voteSummary(lastOutcome),
        );
        if (sentSummary instanceof Error) return sentSummary;
      }

      if (game.stage === "FINISHED") {
        return this.modeServices.get(game.config.mode)?.sendFinalSummary(game);
      }

      if (game.stage === "IN_PROGRESS" && !game.inProgress.pendingVote) {
        return this.modeServices.get(game.config.mode)?.announceCurrentTurn(game);
      }

      return;
    }

    if (transition.changed.stageChanged && transition.current?.stage === "FINISHED") {
      return this.modeServices.get(game.config.mode)?.sendFinalSummary(game);
    }
  }

  private async sendPendingVotePrompt(
    game: GameState,
  ): Promise<void | NotificationError> {
    const pending = game.inProgress.pendingVote;
    if (!pending) {
      return;
    }

    const texts = this.context.textsForGame(game);
    const buttons = [
      [
        {
          kind: "callback" as const,
          text: texts.voteDecisionButton("YES"),
          data: `vote:YES:${game.id}`,
        },
        {
          kind: "callback" as const,
          text: texts.voteDecisionButton("NO"),
          data: `vote:NO:${game.id}`,
        },
        {
          kind: "callback" as const,
          text: texts.voteDecisionButton("GUESSED"),
          data: `vote:GUESSED:${game.id}`,
          style: "success" as const,
        },
      ],
    ];

    if (game.config?.mode === "REVERSE") {
      const targetId = pending.targetWordOwnerId;
      if (!targetId) {
        return;
      }

      const sentVote = await this.context.notifier.sendGroupKeyboard(
        game.chatId,
        texts.reverseVotePrompt(
          this.context.playerLabel(game, pending.askerPlayerId),
          this.context.playerLabel(game, targetId),
        ),
        buttons,
      );
      return sentVote instanceof Error ? sentVote : undefined;
    }

    const sentVote = await this.context.notifier.sendGroupKeyboard(
      game.chatId,
      texts.votePrompt(this.context.playerLabel(game, pending.askerPlayerId)),
      buttons,
    );
    return sentVote instanceof Error ? sentVote : undefined;
  }
}

