import * as appErrors from "../domain/errors.js";
import { GameState, TurnRecord } from "../domain/types.js";
import { TextService } from "./text-service.js";
import {
  ClockPort,
  GameRepository,
  IdPort,
  IdentityPort,
  LoggerPort,
  NotifierPort,
  TransactionRunner,
} from "./ports.js";
import { GameEngine } from "../domain/game-engine.js";
import { GameStatusService } from "./game-status-service.js";

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
  statusService: GameStatusService;
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

  get statusService(): GameStatusService {
    return this.deps.statusService;
  }

  getGameByChatOrError(
    chatId: string,
  ): GameState | appErrors.ActiveGameNotFoundByChatError {
    const game = this.repository.findActiveByChatId(chatId);
    if (!game) {
      return new appErrors.ActiveGameNotFoundByChatError();
    }
    return game;
  }

  getGameByIdOrError(gameId: string): GameState | appErrors.GameNotFoundError {
    const game = this.repository.findById(gameId);
    if (!game) {
      return new appErrors.GameNotFoundError();
    }
    return game;
  }

  republishGameStatus(gameId: string): void | appErrors.GameNotFoundError {
    const game = this.getGameByIdOrError(gameId);
    if (game instanceof Error) return game;

    return this.statusService.publish(game);
  }

  publishGameStatus(game: GameState): void {
    return this.statusService.publish(game);
  }

  findActiveGameByTelegramUser(telegramUserId: string): GameState | null {
    const active = this.repository.listActiveGames();
    return (
      active.find((game) =>
        game.players.some((player) => player.telegramUserId === telegramUserId),
      ) ?? null
    );
  }

  getPlayerByTelegramOrError(
    game: GameState,
    telegramUserId: string,
  ): GameState["players"][number] | appErrors.PlayerNotFoundInGameError {
    const player = game.players.find(
      (candidate) => candidate.telegramUserId === telegramUserId,
    );
    if (!player) {
      return new appErrors.PlayerNotFoundInGameError();
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

