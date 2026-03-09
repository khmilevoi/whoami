import { GameState } from "../../domain/types";
import type { NormalPairingStageError } from "../errors";
import { GameServiceContext } from "../game-service-context";
import { WordPreparationStageService } from "./word-preparation-stage-service";

export class NormalPairingStageService {
  constructor(
    private readonly context: GameServiceContext,
    private readonly wordPreparationStage: WordPreparationStageService,
  ) {}

  async applyManualPair(gameId: string, chooserTelegramUserId: string, targetPlayerId: string): Promise<void | NormalPairingStageError> {
    const updated = this.context.transactionRunner.runInTransaction(() => {
      const current = this.context.getGameByIdOrError(gameId);
      if (current instanceof Error) return current;

      const chooser = this.context.getPlayerByTelegramOrError(current, chooserTelegramUserId);
      if (chooser instanceof Error) return chooser;

      const next = this.context.engine.selectManualPair(current, chooser.id, targetPlayerId, this.context.clock.nowIso());
      if (next instanceof Error) return next;

      this.context.repository.update(next);
      return next;
    });
    if (updated instanceof Error) return updated;

    if (Object.keys(updated.words).length < updated.players.length) {
      return this.promptCurrentChooser(updated);
    }

    const sentCompletion = await this.context.notifier.sendGroupMessage(updated.chatId, this.context.texts.manualPairingCompleted());
    if (sentCompletion instanceof Error) return sentCompletion;
    return this.wordPreparationStage.promptWordCollection(updated);
  }

  async recoverPromptsOnStartup(): Promise<void | NormalPairingStageError> {
    const activeGames = this.context.repository.listActiveGames();

    for (const game of activeGames) {
      if (game.stage !== "PREPARE_WORDS") {
        continue;
      }

      if (game.config?.mode !== "NORMAL" || game.config.pairingMode !== "MANUAL") {
        continue;
      }

      if (game.preparation.manualPairingCursor >= game.preparation.manualPairingQueue.length) {
        continue;
      }

      const result = await this.promptCurrentChooser(game);
      if (result instanceof Error) {
        return result;
      }
    }
  }

  async promptCurrentChooser(game: GameState): Promise<void | NormalPairingStageError> {
    const chooserId = game.preparation.manualPairingQueue[game.preparation.manualPairingCursor];
    const chooser = game.players.find((player) => player.id === chooserId);
    if (!chooser) {
      return;
    }

    const usedTargets = new Set(Object.values(game.pairings));
    const buttons = game.players
      .filter((player) => player.id !== chooser.id)
      .filter((player) => !usedTargets.has(player.id))
      .map((player) => [{ text: this.context.playerLabel(game, player.id), data: `pair:${player.id}:${game.id}` }]);

    const ok = await this.context.notifier.sendPrivateKeyboard(chooser.telegramUserId, this.context.texts.manualPairPrompt(), buttons);
    if (!ok) {
      const sentFallback = await this.context.notifier.sendGroupMessage(
        game.chatId,
        this.context.texts.dmLinkRequired(this.context.playerLabel(game, chooser.id), this.context.notifier.buildBotDeepLink()),
      );
      if (sentFallback instanceof Error) return sentFallback;
    }
  }
}
