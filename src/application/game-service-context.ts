import { DomainError } from "../domain/errors";
import { GameState, TurnRecord } from "../domain/types";
import { TextService } from "./text-service";
import { ClockPort, GameRepository, IdPort, IdentityPort, LoggerPort, NotifierPort, TransactionRunner } from "./ports";
import { GameEngine } from "../domain/game-engine";

export interface GameServiceDeps {
  engine: GameEngine;
  repository: GameRepository;
  transactionRunner: TransactionRunner;
  notifier: NotifierPort;
  identity: IdentityPort;
  idPort: IdPort;
  clock: ClockPort;
  logger: LoggerPort;
  texts: TextService;
  limits: { minPlayers: number; maxPlayers: number };
}

export class GameServiceContext {
  constructor(private readonly deps: GameServiceDeps) {}

  get engine(): GameEngine {
    return this.deps.engine;
  }

  get repository(): GameRepository {
    return this.deps.repository;
  }

  get transactionRunner(): TransactionRunner {
    return this.deps.transactionRunner;
  }

  get notifier(): NotifierPort {
    return this.deps.notifier;
  }

  get identity(): IdentityPort {
    return this.deps.identity;
  }

  get idPort(): IdPort {
    return this.deps.idPort;
  }

  get clock(): ClockPort {
    return this.deps.clock;
  }

  get logger(): LoggerPort {
    return this.deps.logger;
  }

  get texts(): TextService {
    return this.deps.texts;
  }

  get limits(): { minPlayers: number; maxPlayers: number } {
    return this.deps.limits;
  }

  requireGameByChat(chatId: string): GameState {
    const game = this.repository.findActiveByChatId(chatId);
    if (!game) {
      throw new DomainError({ code: "ACTIVE_GAME_NOT_FOUND_BY_CHAT" });
    }
    return game;
  }

  requireGameById(gameId: string): GameState {
    const game = this.repository.findById(gameId);
    if (!game) {
      throw new DomainError({ code: "GAME_NOT_FOUND" });
    }
    return game;
  }

  findActiveGameByTelegramUser(telegramUserId: string): GameState | null {
    const active = this.repository.listActiveGames();
    return active.find((game) => game.players.some((player) => player.telegramUserId === telegramUserId)) ?? null;
  }

  requirePlayerByTelegram(game: GameState, telegramUserId: string) {
    const player = game.players.find((candidate) => candidate.telegramUserId === telegramUserId);
    if (!player) {
      throw new DomainError({ code: "PLAYER_NOT_FOUND_IN_GAME" });
    }
    return player;
  }

  playerLabel(game: GameState, playerId: string): string {
    const player = game.players.find((candidate) => candidate.id === playerId);
    if (!player) {
      return playerId;
    }

    return `${player.displayName}${player.username ? ` (@${player.username})` : ""}`;
  }

  outcomeLabel(outcome: TurnRecord["outcome"]): string {
    return this.texts.voteOutcome(outcome);
  }
}
