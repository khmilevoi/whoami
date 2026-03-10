import { GameMode } from "../../domain/types.js";
import type { ReadyStartError } from "../errors.js";
import { GameServiceContext } from "../game-service-context.js";
import { GameModeService } from "../modes/game-mode-service.js";

export class ReadyStartStageService {
  private readonly modeServices = new Map<GameMode, GameModeService>();

  constructor(
    private readonly context: GameServiceContext,
    services: GameModeService[],
  ) {
    for (const service of services) {
      this.modeServices.set(service.mode, service);
    }
  }

  async tryStartGame(gameId: string): Promise<void | ReadyStartError> {
    const started = this.context.transactionRunner.runInTransaction(() => {
      const current = this.context.getGameByIdOrError(gameId);
      if (current instanceof Error) return current;

      const before = current.stage;
      const next = this.context.engine.startGameIfReady(
        current,
        this.context.clock.nowIso(),
      );
      if (next instanceof Error) return next;

      this.context.repository.update(next);
      return { before, game: next };
    });
    if (started instanceof Error) return started;

    if (
      started.before === started.game.stage ||
      started.game.stage !== "IN_PROGRESS" ||
      !started.game.config
    ) {
      return;
    }

    const modeService = this.modeServices.get(started.game.config.mode);
    if (!modeService) {
      return;
    }

    await modeService.beforeFirstTurn(started.game);

    const sentStart = await this.context.notifier.sendGroupMessage(
      started.game.chatId,
      this.context.texts.allReadyGameStarts(),
    );
    if (sentStart instanceof Error) return sentStart;
    return modeService.announceCurrentTurn(started.game);
  }
}
