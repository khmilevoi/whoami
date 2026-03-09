import { ChatCommandResolver } from "../../application/chat-command-resolver";
import { BotCommandDef, createBotCommands } from "../../application/bot-commands";
import { GameQueryService } from "../../application/game-query-service";
import { LoggerPort } from "../../application/ports";
import { TextService } from "../../application/text-service";

type TelegramScope =
  | { type: "all_private_chats" }
  | { type: "all_group_chats" }
  | { type: "chat"; chat_id: number | string }
  | { type: "chat_member"; chat_id: number | string; user_id: number };

interface TelegramCommandsApi {
  setMyCommands(commands: readonly BotCommandDef[], options?: { scope?: TelegramScope }): Promise<unknown>;
  deleteMyCommands(options?: { scope?: TelegramScope }): Promise<unknown>;
}

const toNumericChatId = (id: string): number | string => {
  const parsed = Number(id);
  return Number.isSafeInteger(parsed) ? parsed : id;
};

const toNumericUserId = (id: string): number => {
  const parsed = Number(id);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Telegram user id must be numeric, got: ${id}`);
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

const commandsSignature = (commands: readonly BotCommandDef[]): string => JSON.stringify(commands);

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

  async syncPrivateCommands(): Promise<void> {
    await this.applyScope({ type: "all_private_chats" }, this.commands.PRIVATE_COMMANDS, "global");
  }

  async syncGroupCommands(): Promise<void> {
    await this.applyScope({ type: "all_group_chats" }, this.commands.GROUP_COMMANDS, "global");
  }

  async syncActiveChats(): Promise<void> {
    await this.syncChats(this.queryService.listActiveChatIds());
  }

  async syncKnownChats(): Promise<void> {
    await this.syncChats(this.queryService.listKnownChatIds());
  }

  async syncChats(chatIds: Iterable<string>): Promise<void> {
    for (const chatId of chatIds) {
      await this.syncChat(chatId);
    }
  }

  async syncChat(chatId: string): Promise<void> {
    const game = this.queryService.findActiveGameByChatId(chatId);
    const resolution = this.resolver.resolve(game);

    await this.applyScope(
      {
        type: "chat",
        chat_id: toNumericChatId(chatId),
      },
      resolution.chatCommands,
      chatId,
    );

    const nextOverrides = new Map<string, BotCommandDef[]>();
    for (const override of resolution.memberOverrides) {
      nextOverrides.set(override.telegramUserId, override.commands);
    }

    for (const [telegramUserId, commands] of nextOverrides) {
      await this.applyScope(
        {
          type: "chat_member",
          chat_id: toNumericChatId(chatId),
          user_id: toNumericUserId(telegramUserId),
        },
        commands,
        chatId,
      );
    }

    const previousMembers = this.appliedChatMembers.get(chatId) ?? new Set<string>();
    const nextMembers = new Set([...nextOverrides.keys()].filter((telegramUserId) => (nextOverrides.get(telegramUserId)?.length ?? 0) > 0));

    const cleanupCandidates = new Set(previousMembers);
    const forceDeleteStaleMemberScopes = game === null;

    if (forceDeleteStaleMemberScopes) {
      for (const telegramUserId of this.queryService.listKnownTelegramUserIdsByChatId(chatId)) {
        cleanupCandidates.add(telegramUserId);
      }
    }

    for (const staleMember of cleanupCandidates) {
      if (nextMembers.has(staleMember)) {
        continue;
      }

      try {
        await this.deleteScope(
          {
            type: "chat_member",
            chat_id: toNumericChatId(chatId),
            user_id: toNumericUserId(staleMember),
          },
          chatId,
          "stale_member_scope",
          forceDeleteStaleMemberScopes,
        );
      } catch (error) {
        this.logger.warn("commands_sync_failed_non_blocking", {
          chatId,
          scope: `chat_member:${chatId}:${staleMember}`,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (nextMembers.size > 0) {
      this.appliedChatMembers.set(chatId, nextMembers);
    } else {
      this.appliedChatMembers.delete(chatId);
    }
  }

  private async applyScope(scope: TelegramScope, commands: readonly BotCommandDef[], chatId: string): Promise<void> {
    const key = scopeKey(scope);

    if (commands.length === 0) {
      await this.deleteScope(scope, chatId, "empty_commands");
      return;
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

    try {
      await this.api.setMyCommands(commands, { scope });
      this.appliedScopeCommands.set(key, nextSignature);
      this.logger.info("commands_synced", {
        chatId,
        scope: scopeLabel(scope),
        reason: "applied",
      });
    } catch (error) {
      this.logger.error("commands_sync_failed", {
        chatId,
        scope: scopeLabel(scope),
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async deleteScope(scope: TelegramScope, chatId: string, reason: string, force = false): Promise<void> {
    const key = scopeKey(scope);
    if (!force && !this.appliedScopeCommands.has(key)) {
      this.logger.info("commands_sync_skipped_no_changes", {
        chatId,
        scope: scopeLabel(scope),
        reason,
      });
      return;
    }

    try {
      await this.api.deleteMyCommands({ scope });
      this.appliedScopeCommands.delete(key);
      this.logger.info("commands_synced", {
        chatId,
        scope: scopeLabel(scope),
        reason,
      });
    } catch (error) {
      this.logger.error("commands_sync_failed", {
        chatId,
        scope: scopeLabel(scope),
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
