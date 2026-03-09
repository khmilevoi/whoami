import { GameMode } from "../../domain/types";
import { GameServiceContext } from "../game-service-context";
import { GameModeService } from "../modes/game-mode-service";

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

  async tryStartGame(gameId: string): Promise<void> {
    const started = this.context.transactionRunner.runInTransaction(() => {
      const current = this.context.requireGameById(gameId);
      const before = current.stage;
      const next = this.context.engine.startGameIfReady(current, this.context.clock.nowIso());
      this.context.repository.update(next);
      return { before, game: next };
    });

    if (started.before === started.game.stage || started.game.stage !== "IN_PROGRESS" || !started.game.config) {
      return;
    }

    const modeService = this.modeServices.get(started.game.config.mode);
    if (!modeService) {
      return;
    }

    await modeService.beforeFirstTurn(started.game);
    await this.context.notifier.sendGroupMessage(started.game.chatId, "Все готовы. Игра начинается.");
    await modeService.announceCurrentTurn(started.game);
  }
}
