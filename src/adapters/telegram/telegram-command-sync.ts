import * as appErrors from "../../domain/errors.js";
import {
  BotCommandDef,
  BotCommandId,
  createBotCommands,
} from "../../application/bot-commands.js";
import { ChatCommandResolver } from "../../application/chat-command-resolver.js";
import {
  GameStatusService,
  GameStatusSubscriber,
  GameStatusTransition,
} from "../../application/game-status-service.js";
import { GameRepository, LoggerPort } from "../../application/ports.js";
import { TextService } from "../../application/text-service.js";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "../../domain/locale.js";
import { SupportedLocale } from "../../domain/types.js";

type TelegramScope =
  | { type: "all_private_chats" }
  | { type: "all_group_chats" }
  | { type: "chat"; chat_id: number | string }
  | { type: "chat_member"; chat_id: number | string; user_id: number };

interface TelegramCommandsApi {
  setMyCommands(
    commands: readonly BotCommandDef[],
    options?: { scope?: TelegramScope; language_code?: SupportedLocale },
  ): Promise<unknown>;
  deleteMyCommands(options?: {
    scope?: TelegramScope;
    language_code?: SupportedLocale;
  }): Promise<unknown>;
}

const toNumericChatId = (id: string): number | string => {
  const parsed = Number(id);
  return Number.isSafeInteger(parsed) ? parsed : id;
};

const toNumericUserId = (
  id: string,
): number | appErrors.CommandSyncAppError => {
  const parsed = Number(id);
  if (!Number.isSafeInteger(parsed)) {
    return new appErrors.CommandSyncError({ scope: id });
  }

  return parsed;
};

const scopeKey = (scope: TelegramScope, languageCode = "default"): string => {
  if (scope.type === "all_private_chats") {
    return `all_private_chats:${languageCode}`;
  }
  if (scope.type === "all_group_chats") {
    return `all_group_chats:${languageCode}`;
  }
  if (scope.type === "chat") {
    return `chat:${scope.chat_id}:${languageCode}`;
  }
  return `chat_member:${scope.chat_id}:${scope.user_id}:${languageCode}`;
};

const scopeLabel = (scope: TelegramScope, languageCode?: string): string => {
  const base =
    scope.type === "all_private_chats"
      ? "all_private_chats"
      : scope.type === "all_group_chats"
        ? "all_group_chats"
        : scope.type === "chat"
          ? `chat:${scope.chat_id}`
          : `chat_member:${scope.chat_id}:${scope.user_id}`;

  return languageCode ? `${base}:${languageCode}` : base;
};

const commandsSignature = (commands: readonly BotCommandDef[]): string =>
  JSON.stringify(commands);

export class TelegramCommandSync implements GameStatusSubscriber {
  private readonly appliedScopeCommands = new Map<string, string>();
  private readonly appliedChatMembers = new Map<string, Set<string>>();

  constructor(
    private readonly api: TelegramCommandsApi,
    private readonly repository: GameRepository,
    private readonly statusService: GameStatusService,
    private readonly resolver: ChatCommandResolver,
    private readonly logger: LoggerPort,
    private readonly texts: TextService,
  ) {}

  async onGameStatusChanged(
    transition: GameStatusTransition,
  ): Promise<void | Error> {
    const chatId = transition.current?.chatId ?? transition.previous?.chatId;
    if (!chatId) {
      return;
    }

    return this.syncChat(chatId);
  }

  async syncPrivateCommands(): Promise<void | appErrors.CommandSyncAppError> {
    return this.applyGlobalScopeForLocales(
      { type: "all_private_chats" },
      ["START_PRIVATE", "LANGUAGE"],
      "global",
    );
  }

  async syncGroupCommands(): Promise<void | appErrors.CommandSyncAppError> {
    return this.applyGlobalScopeForLocales(
      { type: "all_group_chats" },
      ["START_GAME"],
      "global",
    );
  }

  async syncKnownChats(): Promise<void | appErrors.CommandSyncAppError> {
    for (const chatId of this.repository.listKnownChatIds()) {
      const result = await this.syncChat(chatId);
      if (result instanceof Error) return result;
    }
  }

  async syncChat(
    chatId: string,
  ): Promise<void | appErrors.CommandSyncAppError> {
    const snapshot = this.statusService.getByChatId(chatId);
    const resolution = this.resolver.resolve(snapshot);
    const locale = snapshot?.groupLocale ?? DEFAULT_LOCALE;

    const chatScopeResult = await this.applyScope(
      {
        type: "chat",
        chat_id: toNumericChatId(chatId),
      },
      this.materializeCommands(locale, resolution.chatCommands),
      chatId,
    );
    if (chatScopeResult instanceof Error) return chatScopeResult;

    const nextOverrides = new Map<string, BotCommandId[]>();
    for (const override of resolution.memberOverrides) {
      nextOverrides.set(override.telegramUserId, override.commands);
    }

    for (const [telegramUserId, commands] of nextOverrides) {
      const userId = toNumericUserId(telegramUserId);
      if (userId instanceof Error) return userId;

      const memberScopeResult = await this.applyScope(
        {
          type: "chat_member",
          chat_id: toNumericChatId(chatId),
          user_id: userId,
        },
        this.materializeCommands(locale, commands),
        chatId,
      );
      if (memberScopeResult instanceof Error) return memberScopeResult;
    }

    const previousMembers =
      this.appliedChatMembers.get(chatId) ?? new Set<string>();
    const nextMembers = new Set(
      [...nextOverrides.keys()].filter(
        (telegramUserId) =>
          (nextOverrides.get(telegramUserId)?.length ?? 0) > 0,
      ),
    );

    const cleanupCandidates = new Set(previousMembers);
    const forceDeleteStaleMemberScopes = snapshot === null || !snapshot.hasActiveGame;

    if (forceDeleteStaleMemberScopes) {
      for (const telegramUserId of this.repository.listKnownTelegramUserIdsByChatId(
        chatId,
      )) {
        cleanupCandidates.add(telegramUserId);
      }
    }

    for (const staleMember of cleanupCandidates) {
      if (nextMembers.has(staleMember)) {
        continue;
      }

      const userId = toNumericUserId(staleMember);
      if (userId instanceof Error) {
        this.logger.warn("commands_sync_failed_non_blocking", {
          chatId,
          scope: `chat_member:${chatId}:${staleMember}`,
          reason: userId.message,
        });
        continue;
      }

      const deleteResult = await this.deleteScope(
        {
          type: "chat_member",
          chat_id: toNumericChatId(chatId),
          user_id: userId,
        },
        chatId,
        "stale_member_scope",
        forceDeleteStaleMemberScopes,
      );
      if (deleteResult instanceof Error) {
        this.logger.warn("commands_sync_failed_non_blocking", {
          chatId,
          scope: `chat_member:${chatId}:${staleMember}`,
          reason: deleteResult.message,
        });
      }
    }

    if (nextMembers.size > 0) {
      this.appliedChatMembers.set(chatId, nextMembers);
      return;
    }

    this.appliedChatMembers.delete(chatId);
  }

  private materializeCommands(
    locale: SupportedLocale,
    commandIds: readonly BotCommandId[],
  ): BotCommandDef[] {
    const catalog = createBotCommands(this.texts.forLocale(locale));
    return commandIds.map((commandId) => catalog.BOT_COMMANDS[commandId]);
  }

  private async applyGlobalScopeForLocales(
    scope: TelegramScope,
    commandIds: readonly BotCommandId[],
    chatId: string,
  ): Promise<void | appErrors.CommandSyncAppError> {
    for (const locale of SUPPORTED_LOCALES) {
      const result = await this.applyScope(
        scope,
        this.materializeCommands(locale, commandIds),
        chatId,
        locale,
      );
      if (result instanceof Error) return result;
    }

    return this.applyScope(
      scope,
      this.materializeCommands(DEFAULT_LOCALE, commandIds),
      chatId,
      undefined,
    );
  }

  private async applyScope(
    scope: TelegramScope,
    commands: readonly BotCommandDef[],
    chatId: string,
    languageCode?: SupportedLocale,
  ): Promise<void | appErrors.CommandSyncAppError> {
    const key = scopeKey(scope, languageCode);

    if (commands.length === 0) {
      return this.deleteScope(scope, chatId, "empty_commands", false, languageCode);
    }

    const nextSignature = commandsSignature(commands);
    const currentSignature = this.appliedScopeCommands.get(key);

    if (currentSignature === nextSignature) {
      this.logger.info("commands_sync_skipped_no_changes", {
        chatId,
        scope: scopeLabel(scope, languageCode),
        reason: "unchanged",
      });
      return;
    }

    const result = await this.api
      .setMyCommands(commands, {
        scope,
        language_code: languageCode,
      })
      .then(() => undefined)
      .catch(
        (error): appErrors.CommandSyncAppError =>
          new appErrors.CommandSyncError({
            scope: scopeLabel(scope, languageCode),
            cause: error,
          }),
      );
    if (result instanceof Error) {
      this.logger.error("commands_sync_failed", {
        chatId,
        scope: scopeLabel(scope, languageCode),
        reason: result.message,
      });
      return result;
    }

    this.appliedScopeCommands.set(key, nextSignature);
    this.logger.info("commands_synced", {
      chatId,
      scope: scopeLabel(scope, languageCode),
      reason: "applied",
    });
  }

  private async deleteScope(
    scope: TelegramScope,
    chatId: string,
    reason: string,
    force = false,
    languageCode?: SupportedLocale,
  ): Promise<void | appErrors.CommandSyncAppError> {
    const key = scopeKey(scope, languageCode);
    if (!force && !this.appliedScopeCommands.has(key)) {
      this.logger.info("commands_sync_skipped_no_changes", {
        chatId,
        scope: scopeLabel(scope, languageCode),
        reason,
      });
      return;
    }

    const result = await this.api
      .deleteMyCommands({ scope, language_code: languageCode })
      .then(() => undefined)
      .catch(
        (error): appErrors.CommandSyncAppError =>
          new appErrors.CommandSyncError({
            scope: scopeLabel(scope, languageCode),
            cause: error,
          }),
      );
    if (result instanceof Error) {
      this.logger.error("commands_sync_failed", {
        chatId,
        scope: scopeLabel(scope, languageCode),
        reason: result.message,
      });
      return result;
    }

    this.appliedScopeCommands.delete(key);
    this.logger.info("commands_synced", {
      chatId,
      scope: scopeLabel(scope, languageCode),
      reason,
    });
  }
}
