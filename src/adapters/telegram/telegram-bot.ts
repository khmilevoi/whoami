import { Bot, Context } from "grammy";
import { TelegramCommandSync } from "./telegram-command-sync";
import { GameService } from "../../application/game-service";
import { LoggerPort } from "../../application/ports";
import { DomainError } from "../../domain/errors";

const asActor = (ctx: Context) => ({
  telegramUserId: String(ctx.from?.id ?? ""),
  username: ctx.from?.username,
  firstName: ctx.from?.first_name,
  lastName: ctx.from?.last_name,
});

const isPrivate = (ctx: Context): boolean => ctx.chat?.type === "private";

const isGroupChat = (ctx: Context): boolean => {
  const type = ctx.chat?.type;
  return type === "group" || type === "supergroup";
};

const safeReply = async (ctx: Context, text: string): Promise<void> => {
  if (ctx.chat) {
    await ctx.reply(text);
  }
};

const syncChatsSafely = async (
  commandSync: TelegramCommandSync | undefined,
  chatIds: Set<string>,
): Promise<void> => {
  if (!commandSync || chatIds.size === 0) {
    return;
  }

  for (const chatId of chatIds) {
    try {
      await commandSync.syncChat(chatId);
    } catch {
      // Errors are already logged by command sync service.
    }
  }
};

const createSyncFinalizer = (
  ctx: Context,
  commandSync: TelegramCommandSync | undefined,
  actorTelegramUserId?: string,
): (() => Promise<void>) => {
  const beforeUserChats =
    commandSync && actorTelegramUserId
      ? new Set(commandSync.listActiveChatIdsByTelegramUser(actorTelegramUserId))
      : null;

  return async () => {
    if (!commandSync) {
      return;
    }

    const affectedChats = new Set<string>();

    if (isGroupChat(ctx)) {
      affectedChats.add(String(ctx.chat!.id));
    }

    if (beforeUserChats && actorTelegramUserId) {
      for (const chatId of beforeUserChats) {
        affectedChats.add(chatId);
      }

      for (const chatId of commandSync.listActiveChatIdsByTelegramUser(actorTelegramUserId)) {
        affectedChats.add(chatId);
      }
    }

    await syncChatsSafely(commandSync, affectedChats);
  };
};

const execute = async (
  ctx: Context,
  logger: LoggerPort,
  action: () => Promise<void>,
  onFinally?: () => Promise<void>,
): Promise<void> => {
  try {
    await action();
  } catch (error) {
    if (error instanceof DomainError) {
      await safeReply(ctx, error.message);
      return;
    }

    logger.error("telegram_handler_error", {
      error: error instanceof Error ? error.message : String(error),
      updateId: ctx.update.update_id,
    });

    await safeReply(ctx, "Произошла ошибка. Попробуйте еще раз.");
  } finally {
    if (onFinally) {
      await onFinally();
    }
  }
};

export const registerTelegramHandlers = (
  bot: Bot,
  gameService: GameService,
  logger: LoggerPort,
  commandSync?: TelegramCommandSync,
): void => {
  bot.command("start", async (ctx) => {
    const finalizeSync = createSyncFinalizer(ctx, commandSync, ctx.from?.id ? String(ctx.from.id) : undefined);
    await execute(
      ctx,
      logger,
      async () => {
        if (isPrivate(ctx)) {
          await gameService.handlePrivateStart(String(ctx.from!.id));
        }
      },
      finalizeSync,
    );
  });

  bot.command("whoami_start", async (ctx) => {
    const finalizeSync = createSyncFinalizer(ctx, commandSync, ctx.from?.id ? String(ctx.from.id) : undefined);
    await execute(
      ctx,
      logger,
      async () => {
        if (!isGroupChat(ctx)) {
          await safeReply(ctx, "Эта команда доступна только в групповом чате.");
          return;
        }

        await gameService.startGame(String(ctx.chat!.id), asActor(ctx));
        await safeReply(ctx, "Игра создана.");
      },
      finalizeSync,
    );
  });

  bot.command("join", async (ctx) => {
    const finalizeSync = createSyncFinalizer(ctx, commandSync, ctx.from?.id ? String(ctx.from.id) : undefined);
    await execute(
      ctx,
      logger,
      async () => {
        if (!isGroupChat(ctx)) {
          return;
        }

        await gameService.joinGame(String(ctx.chat!.id), asActor(ctx));
        await safeReply(ctx, "Вы в игре.");
      },
      finalizeSync,
    );
  });

  bot.command("whoami_config", async (ctx) => {
    const finalizeSync = createSyncFinalizer(ctx, commandSync, ctx.from?.id ? String(ctx.from.id) : undefined);
    await execute(
      ctx,
      logger,
      async () => {
        if (!isGroupChat(ctx)) {
          return;
        }

        await gameService.beginConfiguration(String(ctx.chat!.id), String(ctx.from!.id));
        await safeReply(ctx, "Настройка отправлена в ЛС создателю.");
      },
      finalizeSync,
    );
  });

  bot.command("whoami_cancel", async (ctx) => {
    const finalizeSync = createSyncFinalizer(ctx, commandSync, ctx.from?.id ? String(ctx.from.id) : undefined);
    await execute(
      ctx,
      logger,
      async () => {
        if (!isGroupChat(ctx)) {
          return;
        }

        await gameService.cancel(String(ctx.chat!.id), String(ctx.from!.id));
        await safeReply(ctx, "Игра отменена.");
      },
      finalizeSync,
    );
  });

  bot.command("giveup", async (ctx) => {
    const finalizeSync = createSyncFinalizer(ctx, commandSync, ctx.from?.id ? String(ctx.from.id) : undefined);
    await execute(
      ctx,
      logger,
      async () => {
        if (!isGroupChat(ctx)) {
          return;
        }
        await gameService.giveUp(String(ctx.chat!.id), String(ctx.from!.id));
      },
      finalizeSync,
    );
  });

  bot.command("ask", async (ctx) => {
    const finalizeSync = createSyncFinalizer(ctx, commandSync, ctx.from?.id ? String(ctx.from.id) : undefined);
    await execute(
      ctx,
      logger,
      async () => {
        if (!isGroupChat(ctx)) {
          return;
        }
        await gameService.askOffline(String(ctx.chat!.id), String(ctx.from!.id));
      },
      finalizeSync,
    );
  });

  bot.on("message:text", async (ctx) => {
    const finalizeSync = createSyncFinalizer(ctx, commandSync, ctx.from?.id ? String(ctx.from.id) : undefined);
    await execute(
      ctx,
      logger,
      async () => {
        const text = ctx.message.text.trim();
        if (text.startsWith("/")) {
          return;
        }

        if (isPrivate(ctx)) {
          await gameService.handlePrivateText(String(ctx.from!.id), text);
        } else if (isGroupChat(ctx)) {
          await gameService.handleGroupText(String(ctx.chat!.id), String(ctx.from!.id), text);
        }
      },
      finalizeSync,
    );
  });

  bot.on("callback_query:data", async (ctx) => {
    const finalizeSync = createSyncFinalizer(ctx, commandSync, ctx.from?.id ? String(ctx.from.id) : undefined);
    await execute(
      ctx,
      logger,
      async () => {
        const payload = ctx.callbackQuery.data;
        const fromUser = String(ctx.from!.id);

        const parts = payload.split(":");
        if (parts[0] === "cfg") {
          const [, key, value, gameId] = parts;
          await gameService.applyConfigStep(gameId, fromUser, key as "mode" | "play" | "pair", value);
          await ctx.answerCallbackQuery();
          return;
        }

        if (parts[0] === "pair") {
          const [, targetPlayerId, gameId] = parts;
          await gameService.applyManualPair(gameId, fromUser, targetPlayerId);
          await ctx.answerCallbackQuery();
          return;
        }

        if (parts[0] === "word") {
          const [, action, value, gameId] = parts;
          await gameService.handleWordCallback(gameId, fromUser, action as "confirm" | "clue" | "final", value as "YES" | "NO");
          await ctx.answerCallbackQuery();
          return;
        }

        if (parts[0] === "vote") {
          const [, value, gameId] = parts;
          await gameService.handleVote(gameId, fromUser, value as "YES" | "NO" | "GUESSED");
          await ctx.answerCallbackQuery();
          return;
        }

        if (parts[0] === "ask") {
          const [, gameId] = parts;
          const active = gameId;
          void active;
          if (ctx.chat) {
            await gameService.askOffline(String(ctx.chat.id), fromUser);
          }
          await ctx.answerCallbackQuery();
          return;
        }

        await ctx.answerCallbackQuery();
      },
      finalizeSync,
    );
  });
};
