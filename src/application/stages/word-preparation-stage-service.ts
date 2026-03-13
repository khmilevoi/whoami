import { WordEntryForPlayerMissingError } from "../../domain/errors.js";
import { GameState } from "../../domain/types.js";
import type {
  PromptWordCollectionError,
  WordPreparationStageError,
} from "../errors.js";
import { GameServiceContext } from "../game-service-context.js";
import { PregameUiSyncService } from "../pregame-ui-sync-service.js";
import { PrivateExpectationStore } from "../stores/private-expectation-store.js";
import { ReadyStartStageService } from "./ready-start-stage-service.js";

export class WordPreparationStageService {
  constructor(
    private readonly context: GameServiceContext,
    private readonly expectationStore: PrivateExpectationStore,
    private readonly readyStartStage: ReadyStartStageService,
    private readonly pregameUiSync: PregameUiSyncService,
  ) {}

  async handlePrivateText(
    telegramUserId: string,
    text: string,
  ): Promise<void | WordPreparationStageError> {
    const game = this.context.findActiveGameByTelegramUser(telegramUserId);
    if (!game) {
      return;
    }

    const player = this.context.getPlayerByTelegramOrError(
      game,
      telegramUserId,
    );
    if (player instanceof Error) return player;

    const expected = this.expectationStore.get(game.id, player.id) ?? "WORD";

    if (game.stage !== "PREPARE_WORDS" && game.stage !== "READY_WAIT") {
      return;
    }

    if (!game.words[player.id]) {
      return this.pregameUiSync.syncGame(game.id);
    }

    if (expected === "CLUE") {
      const updated = this.context.transactionRunner.runInTransaction(() => {
        const current = this.context.getGameByIdOrError(game.id);
        if (current instanceof Error) return current;

        const next = this.context.engine.submitClue(
          current,
          player.id,
          text,
          this.context.clock.nowIso(),
        );
        if (next instanceof Error) return next;

        this.context.repository.update(next);
        return next;
      });
      if (updated instanceof Error) return updated;

      this.expectationStore.delete(game.id, player.id);
      return this.pregameUiSync.syncGame(updated.id);
    }

    const updated = this.context.transactionRunner.runInTransaction(() => {
      const current = this.context.getGameByIdOrError(game.id);
      if (current instanceof Error) return current;

      const next = this.context.engine.submitWord(
        current,
        player.id,
        text,
        this.context.clock.nowIso(),
      );
      if (next instanceof Error) return next;

      this.context.repository.update(next);
      return next;
    });
    if (updated instanceof Error) return updated;

    const entry = updated.words[player.id];
    if (!entry) {
      return new WordEntryForPlayerMissingError();
    }

    return this.pregameUiSync.syncGame(updated.id);
  }

  async handleWordCallback(
    gameId: string,
    telegramUserId: string,
    action: "confirm" | "clue" | "final",
    value: "YES" | "NO",
  ): Promise<void | WordPreparationStageError> {
    const playerGame = this.context.getGameByIdOrError(gameId);
    if (playerGame instanceof Error) return playerGame;

    const player = this.context.getPlayerByTelegramOrError(
      playerGame,
      telegramUserId,
    );
    if (player instanceof Error) return player;

    if (action === "confirm") {
      const updated = this.context.transactionRunner.runInTransaction(() => {
        const current = this.context.getGameByIdOrError(gameId);
        if (current instanceof Error) return current;

        const next = this.context.engine.confirmWord(
          current,
          player.id,
          value === "YES",
          this.context.clock.nowIso(),
        );
        if (next instanceof Error) return next;

        this.context.repository.update(next);
        return next;
      });
      if (updated instanceof Error) return updated;

      if (value === "NO") {
        this.expectationStore.set(gameId, player.id, "WORD");
      }

      return this.pregameUiSync.syncGame(updated.id);
    }

    if (action === "clue") {
      if (value === "YES") {
        this.expectationStore.set(gameId, player.id, "CLUE");
        return this.pregameUiSync.syncGame(gameId);
      }

      const updated = this.context.transactionRunner.runInTransaction(() => {
        const current = this.context.getGameByIdOrError(gameId);
        if (current instanceof Error) return current;

        const next = this.context.engine.submitClue(
          current,
          player.id,
          undefined,
          this.context.clock.nowIso(),
        );
        if (next instanceof Error) return next;

        this.context.repository.update(next);
        return next;
      });
      if (updated instanceof Error) return updated;

      this.expectationStore.delete(gameId, player.id);
      return this.pregameUiSync.syncGame(updated.id);
    }

    const updated = this.context.transactionRunner.runInTransaction(() => {
      const current = this.context.getGameByIdOrError(gameId);
      if (current instanceof Error) return current;

      const next = this.context.engine.finalizeWord(
        current,
        player.id,
        value === "YES",
        this.context.clock.nowIso(),
      );
      if (next instanceof Error) return next;

      this.context.repository.update(next);
      return next;
    });
    if (updated instanceof Error) return updated;

    if (value === "NO") {
      this.expectationStore.set(gameId, player.id, "WORD");
      const syncResult = await this.pregameUiSync.syncGame(updated.id);
      if (syncResult instanceof Error) return syncResult;
      return;
    }

    this.expectationStore.delete(gameId, player.id);
    const syncResult = await this.pregameUiSync.syncGame(updated.id);
    if (syncResult instanceof Error) return syncResult;
    return this.readyStartStage.tryStartGame(updated.id);
  }

  async promptWordCollection(
    game: GameState,
  ): Promise<void | PromptWordCollectionError> {
    for (const player of game.players) {
      this.expectationStore.set(game.id, player.id, "WORD");
    }

    return this.pregameUiSync.syncGame(game.id);
  }
}
