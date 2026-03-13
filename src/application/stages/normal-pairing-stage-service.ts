import { GameState } from "../../domain/types.js";
import type { NormalPairingStageError } from "../errors.js";
import { GameServiceContext } from "../game-service-context.js";
import { PregameUiSyncService } from "../pregame-ui-sync-service.js";
import { WordPreparationStageService } from "./word-preparation-stage-service.js";

export class NormalPairingStageService {
  constructor(
    private readonly context: GameServiceContext,
    private readonly wordPreparationStage: WordPreparationStageService,
    private readonly pregameUiSync: PregameUiSyncService,
  ) {}

  async applyManualPair(
    gameId: string,
    chooserTelegramUserId: string,
    targetPlayerId: string,
  ): Promise<void | NormalPairingStageError> {
    const updated = this.context.transactionRunner.runInTransaction(() => {
      const current = this.context.getGameByIdOrError(gameId);
      if (current instanceof Error) return current;

      const chooser = this.context.getPlayerByTelegramOrError(
        current,
        chooserTelegramUserId,
      );
      if (chooser instanceof Error) return chooser;

      const next = this.context.engine.selectManualPair(
        current,
        chooser.id,
        targetPlayerId,
        this.context.clock.nowIso(),
      );
      if (next instanceof Error) return next;

      this.context.repository.update(next);
      return next;
    });
    if (updated instanceof Error) return updated;

    if (Object.keys(updated.words).length < updated.players.length) {
      return this.promptCurrentChooser(updated);
    }

    const uiSyncResult = await this.pregameUiSync.syncGame(updated.id);
    if (uiSyncResult instanceof Error) return uiSyncResult;
    return this.wordPreparationStage.promptWordCollection(updated);
  }

  async recoverPromptsOnStartup(): Promise<void | NormalPairingStageError> {
    const activeGames = this.context.repository.listActiveGames();

    for (const game of activeGames) {
      if (game.stage !== "PREPARE_WORDS") {
        continue;
      }

      if (
        game.config?.mode !== "NORMAL" ||
        game.config.pairingMode !== "MANUAL"
      ) {
        continue;
      }

      if (
        game.preparation.manualPairingCursor >=
        game.preparation.manualPairingQueue.length
      ) {
        continue;
      }

      const result = await this.promptCurrentChooser(game);
      if (result instanceof Error) {
        return result;
      }
    }
  }

  async promptCurrentChooser(
    game: GameState,
  ): Promise<void | NormalPairingStageError> {
    const syncResult = await this.pregameUiSync.syncGame(game.id);
    if (syncResult instanceof Error) return syncResult;
  }
}
