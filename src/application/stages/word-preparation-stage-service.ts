import { GameState } from "../../domain/types.js";
import type {
  PromptWordCollectionError,
  WordPreparationStageError,
} from "../errors.js";
import { GameServiceContext } from "../game-service-context.js";
import { PrivateExpectationStore } from "../stores/private-expectation-store.js";
import { ReadyStartStageService } from "./ready-start-stage-service.js";

export class WordPreparationStageService {
  constructor(
    private readonly context: GameServiceContext,
    private readonly expectationStore: PrivateExpectationStore,
    private readonly readyStartStage: ReadyStartStageService,
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
      await this.context.notifier.sendPrivateMessage(
        telegramUserId,
        this.context.texts.waitForPairingCompletion(),
      );
      return;
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
      return this.sendWordSummary(updated, player.id);
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

    const sentPrompt = await this.context.notifier.sendPrivateKeyboard(
      telegramUserId,
      this.context.texts.confirmWordPrompt(updated.words[player.id].word ?? ""),
      [
        [
          {
            text: this.context.texts.yesButton(),
            data: `word:confirm:YES:${game.id}`,
          },
          {
            text: this.context.texts.noButton(),
            data: `word:confirm:NO:${game.id}`,
          },
        ],
      ],
    );
    if (!sentPrompt) {
      const sentFallback = await this.context.notifier.sendGroupMessage(
        updated.chatId,
        this.context.texts.dmLinkWithLabel(
          this.context.playerLabel(updated, player.id),
          this.context.notifier.buildBotDeepLink(),
        ),
      );
      if (sentFallback instanceof Error) return sentFallback;
    }
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
        await this.context.notifier.sendPrivateMessage(
          telegramUserId,
          this.context.texts.reenterWordPrompt(),
        );
        return;
      }

      await this.context.notifier.sendPrivateKeyboard(
        telegramUserId,
        this.context.texts.addCluePrompt(),
        [
          [
            {
              text: this.context.texts.yesButton(),
              data: `word:clue:YES:${gameId}`,
            },
            {
              text: this.context.texts.noButton(),
              data: `word:clue:NO:${gameId}`,
            },
          ],
        ],
      );

      return this.sendWordSummary(updated, player.id, false);
    }

    if (action === "clue") {
      if (value === "YES") {
        this.expectationStore.set(gameId, player.id, "CLUE");
        await this.context.notifier.sendPrivateMessage(
          telegramUserId,
          this.context.texts.enterCluePrompt(),
        );
        return;
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
      return this.sendWordSummary(updated, player.id);
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
      await this.context.notifier.sendPrivateMessage(
        telegramUserId,
        this.context.texts.restartWordPrompt(),
      );
      return;
    }

    this.expectationStore.delete(gameId, player.id);
    await this.context.notifier.sendPrivateMessage(
      telegramUserId,
      this.context.texts.readyWaitingOthers(),
    );
    return this.readyStartStage.tryStartGame(updated.id);
  }

  async promptWordCollection(
    game: GameState,
  ): Promise<void | PromptWordCollectionError> {
    for (const player of game.players) {
      const ok = await this.context.notifier.sendPrivateMessage(
        player.telegramUserId,
        this.context.texts.enterWordPrompt(),
      );
      if (!ok) {
        const updated = this.context.transactionRunner.runInTransaction(() => {
          const current = this.context.getGameByIdOrError(game.id);
          if (current instanceof Error) return current;

          const next = this.context.engine.markDmBlocked(
            current,
            player.id,
            this.context.clock.nowIso(),
          );
          if (next instanceof Error) return next;

          this.context.repository.update(next);
          return next;
        });
        if (updated instanceof Error) return updated;

        const sentFallback = await this.context.notifier.sendGroupMessage(
          game.chatId,
          this.context.texts.dmLinkWithLabel(
            this.context.playerLabel(game, player.id),
            this.context.notifier.buildBotDeepLink(),
          ),
        );
        if (sentFallback instanceof Error) return sentFallback;
      }

      this.expectationStore.set(game.id, player.id, "WORD");
    }
  }

  async sendWordSummary(
    game: GameState,
    playerId: string,
    includeButtons = true,
  ): Promise<void | PromptWordCollectionError> {
    const player = game.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      return;
    }

    const entry = game.words[playerId];
    if (!entry) {
      return;
    }

    const text = this.context.texts.wordSummary(entry.word, entry.clue);

    if (!includeButtons) {
      await this.context.notifier.sendPrivateMessage(
        player.telegramUserId,
        text,
      );
      return;
    }

    const sentSummary = await this.context.notifier.sendPrivateKeyboard(
      player.telegramUserId,
      text,
      [
        [
          {
            text: this.context.texts.confirmButton(),
            data: `word:final:YES:${game.id}`,
          },
          {
            text: this.context.texts.editButton(),
            data: `word:final:NO:${game.id}`,
          },
        ],
      ],
    );
    if (!sentSummary) {
      const sentFallback = await this.context.notifier.sendGroupMessage(
        game.chatId,
        this.context.texts.dmLinkWithLabel(
          this.context.playerLabel(game, player.id),
          this.context.notifier.buildBotDeepLink(),
        ),
      );
      if (sentFallback instanceof Error) return sentFallback;
    }
  }
}
