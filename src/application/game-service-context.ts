import { GameEngine } from "../domain/game-engine";
import { DomainError } from "../domain/errors";
import { ClockPort, GameRepository, IdPort, IdentityPort, LoggerPort, NotifierPort, TransactionRunner } from "./ports";
import { GameState } from "../domain/types";

export interface GameServiceDeps {
  engine: GameEngine;
  repository: GameRepository;
  transactionRunner: TransactionRunner;
  notifier: NotifierPort;
  identity: IdentityPort;
  idPort: IdPort;
  clock: ClockPort;
  logger: LoggerPort;
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

  get limits(): { minPlayers: number; maxPlayers: number } {
    return this.deps.limits;
  }

  requireGameByChat(chatId: string): GameState {
    const game = this.repository.findActiveByChatId(chatId);
    if (!game) {
      throw new DomainError("Активная игра в этом чате не найдена");
    }
    return game;
  }

  requireGameById(gameId: string): GameState {
    const game = this.repository.findById(gameId);
    if (!game) {
      throw new DomainError("Игра не найдена");
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
      throw new DomainError("Игрок не найден в этой игре");
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

  outcomeLabel(outcome: string): string {
    if (outcome === "YES") {
      return "Да";
    }
    if (outcome === "NO") {
      return "Нет";
    }
    if (outcome === "GUESSED") {
      return "Угадал";
    }
    return "Сдался";
  }
}
