import * as appErrors from "../../domain/errors";
import {
  BotCommandDef,
  createBotCommands,
} from "../../application/bot-commands";
import { ChatCommandResolver } from "../../application/chat-command-resolver";
import { GameQueryService } from "../../application/game-query-service";
import { LoggerPort } from "../../application/ports";
import { TextService } from "../../application/text-service";

type TelegramScope =
  | { type: "all_private_chats" }
  | { type: "all_group_chats" }
  | { type: "chat"; chat_id: number | string }
  | { type: "chat_member"; chat_id: number | string; user_id: number };

interface TelegramCommandsApi {
  setMyCommands(
    commands: readonly BotCommandDef[],
    options?: { scope?: TelegramScope },
  ): Promise<unknown>;
  deleteMyCommands(options?: { scope?: TelegramScope }): Promise<unknown>;
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

const scopeKey = (scope: TelegramScope): string => {
  if (scope.type === "all_private_chats") {
    return "all_private_chats";
  }
  if (scope.type === "all_group_chats") {
    return "all_group_chats";
  }
  if (scope.type === "chat") {
    return `chat:${scope.chat_id}`;
  }
  return `chat_member:${scope.chat_id}:${scope.user_id}`;
};

const scopeLabel = (scope: TelegramScope): string => {
  if (scope.type === "all_private_chats") {
    return "all_private_chats";
  }
  if (scope.type === "all_group_chats") {
    return "all_group_chats";
  }
  if (scope.type === "chat") {
    return `chat:${scope.chat_id}`;
  }
  return `chat_member:${scope.chat_id}:${scope.user_id}`;
};

const commandsSignature = (commands: readonly BotCommandDef[]): string =>
  JSON.stringify(commands);

export class TelegramCommandSync {
  private readonly appliedScopeCommands = new Map<string, string>();
  private readonly appliedChatMembers = new Map<string, Set<string>>();
  private readonly commands;

  constructor(
    private readonly api: TelegramCommandsApi,
    private readonly queryService: GameQueryService,
    private readonly resolver: ChatCommandResolver,
    private readonly logger: LoggerPort,
    texts: TextService,
  ) {
    this.commands = createBotCommands(texts);
  }

  listActiveChatIdsByTelegramUser(telegramUserId: string): string[] {
    return this.queryService.listActiveChatIdsByTelegramUser(telegramUserId);
  }

  async syncPrivateCommands(): Promise<void | appErrors.CommandSyncAppError> {
    return this.applyScope(
      { type: "all_private_chats" },
      this.commands.PRIVATE_COMMANDS,
      "global",
    );
  }

  async syncGroupCommands(): Promise<void | appErrors.CommandSyncAppError> {
    return this.applyScope(
      { type: "all_group_chats" },
      this.commands.GROUP_COMMANDS,
      "global",
    );
  }

  async syncActiveChats(): Promise<void | appErrors.CommandSyncAppError> {
    return this.syncChats(this.queryService.listActiveChatIds());
  }

  async syncKnownChats(): Promise<void | appErrors.CommandSyncAppError> {
    return this.syncChats(this.queryService.listKnownChatIds());
  }

  async syncChats(
    chatIds: Iterable<string>,
  ): Promise<void | appErrors.CommandSyncAppError> {
    for (const chatId of chatIds) {
      const result = await this.syncChat(chatId);
      if (result instanceof Error) return result;
    }
  }

  async syncChat(
    chatId: string,
  ): Promise<void | appErrors.CommandSyncAppError> {
    const game = this.queryService.findActiveGameByChatId(chatId);
    const resolution = this.resolver.resolve(game);

    const chatScopeResult = await this.applyScope(
      {
        type: "chat",
        chat_id: toNumericChatId(chatId),
      },
      resolution.chatCommands,
      chatId,
    );
    if (chatScopeResult instanceof Error) return chatScopeResult;

    const nextOverrides = new Map<string, BotCommandDef[]>();
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
        commands,
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
    const forceDeleteStaleMemberScopes = game === null;

    if (forceDeleteStaleMemberScopes) {
      for (const telegramUserId of this.queryService.listKnownTelegramUserIdsByChatId(
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
    } else {
      this.appliedChatMembers.delete(chatId);
    }
  }

  private async applyScope(
    scope: TelegramScope,
    commands: readonly BotCommandDef[],
    chatId: string,
  ): Promise<void | appErrors.CommandSyncAppError> {
    const key = scopeKey(scope);

    if (commands.length === 0) {
      return this.deleteScope(scope, chatId, "empty_commands");
    }

    const nextSignature = commandsSignature(commands);
    const currentSignature = this.appliedScopeCommands.get(key);

    if (currentSignature === nextSignature) {
      this.logger.info("commands_sync_skipped_no_changes", {
        chatId,
        scope: scopeLabel(scope),
        reason: "unchanged",
      });
      return;
    }

    const result = await this.api
      .setMyCommands(commands, { scope })
      .then(() => undefined)
      .catch(
        (error): appErrors.CommandSyncAppError =>
          new appErrors.CommandSyncError({
            scope: scopeLabel(scope),
            cause: error,
          }),
      );
    if (result instanceof Error) {
      this.logger.error("commands_sync_failed", {
        chatId,
        scope: scopeLabel(scope),
        reason: result.message,
      });
      return result;
    }

    this.appliedScopeCommands.set(key, nextSignature);
    this.logger.info("commands_synced", {
      chatId,
      scope: scopeLabel(scope),
      reason: "applied",
    });
  }

  private async deleteScope(
    scope: TelegramScope,
    chatId: string,
    reason: string,
    force = false,
  ): Promise<void | appErrors.CommandSyncAppError> {
    const key = scopeKey(scope);
    if (!force && !this.appliedScopeCommands.has(key)) {
      this.logger.info("commands_sync_skipped_no_changes", {
        chatId,
        scope: scopeLabel(scope),
        reason,
      });
      return;
    }

    const result = await this.api
      .deleteMyCommands({ scope })
      .then(() => undefined)
      .catch(
        (error): appErrors.CommandSyncAppError =>
          new appErrors.CommandSyncError({
            scope: scopeLabel(scope),
            cause: error,
          }),
      );
    if (result instanceof Error) {
      this.logger.error("commands_sync_failed", {
        chatId,
        scope: scopeLabel(scope),
        reason: result.message,
      });
      return result;
    }

    this.appliedScopeCommands.delete(key);
    this.logger.info("commands_synced", {
      chatId,
      scope: scopeLabel(scope),
      reason,
    });
  }
}
