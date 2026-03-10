import type { NotificationError } from "../../domain/errors.js";
import { GameState, VoteDecision } from "../../domain/types.js";
import type {
  GiveUpHandlingError,
  StartQuestionError,
  VoteHandlingError,
} from "../errors.js";
import { GameServiceContext } from "../game-service-context.js";
import { GameModeService } from "./game-mode-service.js";

export abstract class BaseGameModeService implements GameModeService {
  abstract readonly mode: GameModeService["mode"];

  constructor(protected readonly context: GameServiceContext) {}

  async handleGroupText(
    chatId: string,
    telegramUserId: string,
    text: string,
  ): Promise<void | StartQuestionError> {
    const game = this.context.repository.findActiveByChatId(chatId);
    if (
      !game ||
      game.stage !== "IN_PROGRESS" ||
      game.config?.mode !== this.mode ||
      game.config.playMode !== "ONLINE"
    ) {
      return;
    }

    const actor = game.players.find(
      (player) => player.telegramUserId === telegramUserId,
    );
    if (!actor) {
      return;
    }

    return this.startQuestion(game.id, actor.id, text);
  }

  async askOffline(
    chatId: string,
    telegramUserId: string,
  ): Promise<void | StartQuestionError> {
    const game = this.context.repository.findActiveByChatId(chatId);
    if (
      !game ||
      game.stage !== "IN_PROGRESS" ||
      game.config?.mode !== this.mode ||
      game.config.playMode !== "OFFLINE"
    ) {
      return;
    }

    const actor = game.players.find(
      (player) => player.telegramUserId === telegramUserId,
    );
    if (!actor) {
      return;
    }

    return this.startQuestion(game.id, actor.id, undefined);
  }

  async handleVote(
    gameId: string,
    voterTelegramUserId: string,
    decision: VoteDecision,
  ): Promise<void | VoteHandlingError> {
    const game = this.context.getGameByIdOrError(gameId);
    if (game instanceof Error) return game;

    const voter = this.context.getPlayerByTelegramOrError(
      game,
      voterTelegramUserId,
    );
    if (voter instanceof Error) return voter;

    const updated = this.context.transactionRunner.runInTransaction(() => {
      const current = this.context.getGameByIdOrError(gameId);
      if (current instanceof Error) return current;

      const next = this.context.engine.castVote(current, {
        voterPlayerId: voter.id,
        decision,
        voteRecordId: this.context.idPort.nextId(),
        turnRecordId: this.context.idPort.nextId(),
        now: this.context.clock.nowIso(),
      });
      if (next instanceof Error) return next;

      this.context.repository.update(next);
      return next;
    });
    if (updated instanceof Error) return updated;

    if (updated.inProgress.pendingVote) {
      return;
    }

    const lastTurn = updated.turns[updated.turns.length - 1];
    if (lastTurn) {
      const sentSummary = await this.context.notifier.sendGroupMessage(
        updated.chatId,
        this.context.texts.voteSummary(lastTurn.outcome),
      );
      if (sentSummary instanceof Error) return sentSummary;
    }

    if (updated.stage === "FINISHED") {
      return this.sendFinalSummary(updated);
    }

    return this.announceCurrentTurn(updated);
  }

  async giveUp(
    chatId: string,
    telegramUserId: string,
  ): Promise<void | GiveUpHandlingError> {
    const game = this.context.repository.findActiveByChatId(chatId);
    if (!game || game.config?.mode !== this.mode) {
      return;
    }

    if (game.stage !== "IN_PROGRESS") {
      const sentMessage = await this.context.notifier.sendGroupMessage(
        chatId,
        this.context.texts.giveUpOnlyDuringGame(),
      );
      if (sentMessage instanceof Error) return sentMessage;
      return;
    }

    const player = this.context.getPlayerByTelegramOrError(
      game,
      telegramUserId,
    );
    if (player instanceof Error) return player;

    const updated = this.context.transactionRunner.runInTransaction(() => {
      const current = this.context.getGameByIdOrError(game.id);
      if (current instanceof Error) return current;

      const next = this.context.engine.giveUp(current, {
        playerId: player.id,
        turnRecordId: this.context.idPort.nextId(),
        now: this.context.clock.nowIso(),
      });
      if (next instanceof Error) return next;

      this.context.repository.update(next);
      return next;
    });
    if (updated instanceof Error) return updated;

    const sentGiveUp = await this.context.notifier.sendGroupMessage(
      chatId,
      this.context.texts.playerGaveUp(player.displayName),
    );
    if (sentGiveUp instanceof Error) return sentGiveUp;

    if (updated.stage === "FINISHED") {
      return this.sendFinalSummary(updated);
    }

    return this.announceCurrentTurn(updated);
  }

  abstract announceCurrentTurn(
    game: GameState,
  ): Promise<void | NotificationError>;
  abstract beforeFirstTurn(game: GameState): Promise<void>;
  abstract sendFinalSummary(game: GameState): Promise<void | NotificationError>;

  protected abstract startQuestion(
    gameId: string,
    actorPlayerId: string,
    questionText?: string,
  ): Promise<void | StartQuestionError>;
}
