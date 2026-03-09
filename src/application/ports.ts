import { GameState, PlayerIdentity } from "../domain/types";

export interface GameRepository {
  create(game: GameState): void;
  update(game: GameState): void;
  findById(gameId: string): GameState | null;
  findActiveByChatId(chatId: string): GameState | null;
  listActiveGames(): GameState[];
  listKnownChatIds(): string[];
  listKnownTelegramUserIdsByChatId(chatId: string): string[];
}

export interface TransactionRunner {
  runInTransaction<T>(work: () => T): T;
}

export interface IdPort {
  nextId(): string;
}

export interface ClockPort {
  nowIso(): string;
}

export interface IdentityPort {
  toPlayerIdentity(input: {
    telegramUserId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
  }): PlayerIdentity;
}

export interface NotifierPort {
  sendGroupMessage(chatId: string, text: string): Promise<void>;
  sendGroupKeyboard(chatId: string, text: string, buttons: Array<Array<{ text: string; data: string }>>): Promise<void>;
  sendPrivateMessage(userId: string, text: string): Promise<boolean>;
  sendPrivateKeyboard(userId: string, text: string, buttons: Array<Array<{ text: string; data: string }>>): Promise<boolean>;
  buildBotDeepLink(): string;
}

export interface LoggerPort {
  info(event: string, payload?: Record<string, unknown>): void;
  warn(event: string, payload?: Record<string, unknown>): void;
  error(event: string, payload?: Record<string, unknown>): void;
}
