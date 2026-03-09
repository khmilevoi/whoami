import { GameState } from "../../domain/types";
import { GameServiceContext } from "../game-service-context";
import { WordPreparationStageService } from "./word-preparation-stage-service";

export const MANUAL_PAIR_PROMPT_TEXT = "Выберите игрока, которому загадываете слово:";

export class NormalPairingStageService {
  constructor(
    private readonly context: GameServiceContext,
    private readonly wordPreparationStage: WordPreparationStageService,
  ) {}

  async applyManualPair(gameId: string, chooserTelegramUserId: string, targetPlayerId: string): Promise<void> {
    const updated = this.context.transactionRunner.runInTransaction(() => {
      const current = this.context.requireGameById(gameId);
      const chooser = this.context.requirePlayerByTelegram(current, chooserTelegramUserId);
      const next = this.context.engine.selectManualPair(current, chooser.id, targetPlayerId, this.context.clock.nowIso());
      this.context.repository.update(next);
      return next;
    });

    if (Object.keys(updated.words).length < updated.players.length) {
      await this.promptCurrentChooser(updated);
      return;
    }

    await this.context.notifier.sendGroupMessage(updated.chatId, "Ручное распределение завершено. Переходим к вводу слов.");
    await this.wordPreparationStage.promptWordCollection(updated);
  }

  async recoverPromptsOnStartup(): Promise<void> {
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

      await this.promptCurrentChooser(game);
    }
  }

  async promptCurrentChooser(game: GameState): Promise<void> {
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

    const ok = await this.context.notifier.sendPrivateKeyboard(chooser.telegramUserId, MANUAL_PAIR_PROMPT_TEXT, buttons);
    if (!ok) {
      await this.context.notifier.sendGroupMessage(
        game.chatId,
        `${this.context.playerLabel(game, chooser.id)} не открыл ЛС. Откройте: ${this.context.notifier.buildBotDeepLink()}`,
      );
    }
  }
}
