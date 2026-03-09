import { GameState, VoteDecision } from "../../domain/types";
import { GameServiceContext } from "../game-service-context";
import { GameModeService } from "./game-mode-service";

export abstract class BaseGameModeService implements GameModeService {
  abstract readonly mode: GameModeService["mode"];

  constructor(protected readonly context: GameServiceContext) {}

  async handleGroupText(chatId: string, telegramUserId: string, text: string): Promise<void> {
    const game = this.context.repository.findActiveByChatId(chatId);
    if (!game || game.stage !== "IN_PROGRESS" || game.config?.mode !== this.mode || game.config.playMode !== "ONLINE") {
      return;
    }

    const actor = game.players.find((player) => player.telegramUserId === telegramUserId);
    if (!actor) {
      return;
    }

    await this.startQuestion(game.id, actor.id, text);
  }

  async askOffline(chatId: string, telegramUserId: string): Promise<void> {
    const game = this.context.repository.findActiveByChatId(chatId);
    if (!game || game.stage !== "IN_PROGRESS" || game.config?.mode !== this.mode || game.config.playMode !== "OFFLINE") {
      return;
    }

    const actor = game.players.find((player) => player.telegramUserId === telegramUserId);
    if (!actor) {
      return;
    }

    await this.startQuestion(game.id, actor.id, undefined);
  }

  async handleVote(gameId: string, voterTelegramUserId: string, decision: VoteDecision): Promise<void> {
    const game = this.context.requireGameById(gameId);
    const voter = this.context.requirePlayerByTelegram(game, voterTelegramUserId);

    const updated = this.context.transactionRunner.runInTransaction(() => {
      const current = this.context.requireGameById(gameId);
      const next = this.context.engine.castVote(current, {
        voterPlayerId: voter.id,
        decision,
        voteRecordId: this.context.idPort.nextId(),
        turnRecordId: this.context.idPort.nextId(),
        now: this.context.clock.nowIso(),
      });
      this.context.repository.update(next);
      return next;
    });

    if (updated.inProgress.pendingVote) {
      return;
    }

    const lastTurn = updated.turns[updated.turns.length - 1];
    if (lastTurn) {
      await this.context.notifier.sendGroupMessage(updated.chatId, `Итог голосования: ${this.context.outcomeLabel(lastTurn.outcome)}.`);
    }

    if (updated.stage === "FINISHED") {
      await this.sendFinalSummary(updated);
      return;
    }

    await this.announceCurrentTurn(updated);
  }

  async giveUp(chatId: string, telegramUserId: string): Promise<void> {
    const game = this.context.repository.findActiveByChatId(chatId);
    if (!game || game.config?.mode !== this.mode) {
      return;
    }

    if (game.stage !== "IN_PROGRESS") {
      await this.context.notifier.sendGroupMessage(chatId, "Команда /giveup доступна только во время игрового этапа.");
      return;
    }

    const player = this.context.requirePlayerByTelegram(game, telegramUserId);

    const updated = this.context.transactionRunner.runInTransaction(() => {
      const current = this.context.requireGameById(game.id);
      const next = this.context.engine.giveUp(current, {
        playerId: player.id,
        turnRecordId: this.context.idPort.nextId(),
        now: this.context.clock.nowIso(),
      });
      this.context.repository.update(next);
      return next;
    });

    await this.context.notifier.sendGroupMessage(chatId, `${player.displayName} сдался.`);

    if (updated.stage === "FINISHED") {
      await this.sendFinalSummary(updated);
      return;
    }

    await this.announceCurrentTurn(updated);
  }

  abstract announceCurrentTurn(game: GameState): Promise<void>;
  abstract beforeFirstTurn(game: GameState): Promise<void>;
  abstract sendFinalSummary(game: GameState): Promise<void>;

  protected abstract startQuestion(gameId: string, actorPlayerId: string, questionText?: string): Promise<void>;
}
