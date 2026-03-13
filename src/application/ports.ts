import type { NotificationError } from "../domain/errors.js";
import {
  GameState,
  LocaleSource,
  PlayerIdentity,
  SupportedLocale,
  UiButton,
} from "../domain/types.js";

export interface NotificationReceipt {
  messageId: number;
}

export interface StoredPlayerProfile {
  id: string;
  telegramUserId: string;
  username?: string;
  displayName: string;
  locale: SupportedLocale;
  localeSource: LocaleSource;
  createdAt: string;
}

export interface GameRepository {
  create(game: GameState): void;
  update(game: GameState): void;
  findById(gameId: string): GameState | null;
  findActiveByChatId(chatId: string): GameState | null;
  listActiveGames(): GameState[];
  listKnownChatIds(): string[];
  listKnownTelegramUserIdsByChatId(chatId: string): string[];
  findPlayerProfileByTelegramUserId(telegramUserId: string): StoredPlayerProfile | null;
  upsertPlayerProfile(profile: StoredPlayerProfile): void;
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
    languageCode?: string;
    locale?: SupportedLocale;
    localeSource?: LocaleSource;
  }): PlayerIdentity;
}

export interface NotifierPort {
  sendGroupMessage(
    chatId: string,
    text: string,
  ): Promise<NotificationReceipt | NotificationError>;
  sendGroupKeyboard(
    chatId: string,
    text: string,
    buttons: UiButton[][],
  ): Promise<NotificationReceipt | NotificationError>;
  editGroupMessage(
    chatId: string,
    messageId: number,
    text: string,
    buttons?: UiButton[][],
  ): Promise<NotificationReceipt | NotificationError>;
  sendPrivateMessage(
    userId: string,
    text: string,
  ): Promise<false | NotificationReceipt>;
  sendPrivateKeyboard(
    userId: string,
    text: string,
    buttons: UiButton[][],
  ): Promise<false | NotificationReceipt>;
  editPrivateMessage(
    userId: string,
    messageId: number,
    text: string,
    buttons?: UiButton[][],
  ): Promise<false | NotificationReceipt>;
  buildBotDeepLink(payload?: string): string;
  buildGroupMessageLink(chatId: string, messageId: number): string | null;
}

export interface LoggerPort {
  info(event: string, payload?: Record<string, unknown>): void;
  warn(event: string, payload?: Record<string, unknown>): void;
  error(event: string, payload?: Record<string, unknown>): void;
}
