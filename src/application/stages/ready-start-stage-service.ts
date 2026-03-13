import type { ReadyStartError } from "../errors.js";
import { GameServiceContext } from "../game-service-context.js";

export class ReadyStartStageService {
  constructor(private readonly context: GameServiceContext) {}

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

    return this.context.publishGameStatus(started.game);
  }
}
