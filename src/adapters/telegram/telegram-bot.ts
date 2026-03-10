import * as errore from "errore";
import * as appErrors from "../../domain/errors";
import { Bot, Context } from "grammy";
import { GameService } from "../../application/game-service";
import type { TelegramHandlerError } from "../../application/errors";
import { LoggerPort } from "../../application/ports";
import { TextService } from "../../application/text-service";
import { TelegramCommandSync } from "./telegram-command-sync";
import { parseManualPairPayload } from "./manual-pair-payload";

type GroupMessageReadStatus = "enabled" | "disabled" | "unknown";

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
  logger: LoggerPort,
  chatIds: Set<string>,
): Promise<void> => {
  if (!commandSync || chatIds.size === 0) {
    return;
  }

  for (const chatId of chatIds) {
    const result = await commandSync.syncChat(chatId);
    if (result instanceof Error) {
      logger.warn("commands_sync_failed_non_blocking", {
        chatId,
        reason: result.message,
      });
    }
  }
};

const createSyncFinalizer = (
  ctx: Context,
  logger: LoggerPort,
  commandSync: TelegramCommandSync | undefined,
  actorTelegramUserId?: string,
): (() => Promise<void>) => {
  const beforeUserChats =
    commandSync && actorTelegramUserId
      ? new Set(
          commandSync.listActiveChatIdsByTelegramUser(actorTelegramUserId),
        )
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

      for (const chatId of commandSync.listActiveChatIdsByTelegramUser(
        actorTelegramUserId,
      )) {
        affectedChats.add(chatId);
      }
    }

    await syncChatsSafely(commandSync, logger, affectedChats);
  };
};

const replyForReturnedError = async (
  ctx: Context,
  logger: LoggerPort,
  texts: TextService,
  error: TelegramHandlerError,
): Promise<void> => {
  if (error instanceof appErrors.DomainAppErrorBase) {
    await safeReply(ctx, texts.renderError(error));
    return;
  }

  await errore.matchError(error, {
    TelegramApiError: async (typedError) => {
      logger.error("telegram_handler_error", {
        error: typedError.message,
        kind: typedError.name,
        updateId: ctx.update.update_id,
      });
      await safeReply(ctx, texts.genericErrorRetry());
    },
    Error: async (unexpected) => {
      logger.error("telegram_handler_error", {
        error: unexpected.message,
        kind: unexpected.name,
        updateId: ctx.update.update_id,
      });
      await safeReply(ctx, texts.genericErrorRetry());
    },
  });
};

const execute = async (
  ctx: Context,
  logger: LoggerPort,
  texts: TextService,
  action: () => Promise<void | TelegramHandlerError>,
  onFinally?: () => Promise<void>,
): Promise<void> => {
  try {
    const result = await action();
    if (result instanceof Error) {
      await replyForReturnedError(ctx, logger, texts, result);
    }
  } catch (error) {
    logger.error("telegram_handler_error", {
      error: error instanceof Error ? error.message : String(error),
      updateId: ctx.update.update_id,
    });

    await safeReply(ctx, texts.genericErrorRetry());
  } finally {
    if (onFinally) {
      try {
        await onFinally();
      } catch (error) {
        logger.error("telegram_handler_finalizer_error", {
          error: error instanceof Error ? error.message : String(error),
          updateId: ctx.update.update_id,
        });
      }
    }
  }
};

const createGroupMessageReadStatusResolver = (
  bot: Bot,
  logger: LoggerPort,
): (() => Promise<GroupMessageReadStatus>) => {
  let cached: GroupMessageReadStatus | null = null;
  let inFlight: Promise<GroupMessageReadStatus> | null = null;

  return async () => {
    if (cached) {
      return cached;
    }

    if (inFlight) {
      return inFlight;
    }

    inFlight = bot.api
      .getMe()
      .then((me) => {
        if (me.can_read_all_group_messages === true) {
          cached = "enabled";
          return cached;
        }

        if (me.can_read_all_group_messages === false) {
          cached = "disabled";
          return cached;
        }

        logger.warn("telegram_group_read_capability_unknown", {
          reason: "missing_can_read_all_group_messages_flag",
        });
        cached = "unknown";
        return cached;
      })
      .catch((error) => {
        logger.error("telegram_group_read_capability_check_failed", {
          reason: error instanceof Error ? error.message : String(error),
        });
        cached = "unknown";
        return cached;
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  };
};

export const registerTelegramHandlers = (
  bot: Bot,
  gameService: GameService,
  logger: LoggerPort,
  texts: TextService,
  commandSync?: TelegramCommandSync,
): void => {
  const resolveGroupMessageReadStatus = createGroupMessageReadStatusResolver(
    bot,
    logger,
  );

  bot.command("start", async (ctx) => {
    const finalizeSync = createSyncFinalizer(
      ctx,
      logger,
      commandSync,
      ctx.from?.id ? String(ctx.from.id) : undefined,
    );
    await execute(
      ctx,
      logger,
      texts,
      async () => {
        if (isPrivate(ctx)) {
          return gameService.handlePrivateStart(String(ctx.from!.id));
        }
      },
      finalizeSync,
    );
  });

  bot.command("whoami_start", async (ctx) => {
    const finalizeSync = createSyncFinalizer(
      ctx,
      logger,
      commandSync,
      ctx.from?.id ? String(ctx.from.id) : undefined,
    );
    await execute(
      ctx,
      logger,
      texts,
      async () => {
        if (!isGroupChat(ctx)) {
          await safeReply(ctx, texts.groupOnlyCommand());
          return;
        }

        const result = await gameService.startGame(
          String(ctx.chat.id),
          asActor(ctx),
        );
        if (result instanceof Error) return result;

        await safeReply(ctx, texts.gameCreatedAck());
      },
      finalizeSync,
    );
  });

  bot.command("join", async (ctx) => {
    const finalizeSync = createSyncFinalizer(
      ctx,
      logger,
      commandSync,
      ctx.from?.id ? String(ctx.from.id) : undefined,
    );
    await execute(
      ctx,
      logger,
      texts,
      async () => {
        if (!isGroupChat(ctx)) {
          return;
        }

        const result = await gameService.joinGame(
          String(ctx.chat.id),
          asActor(ctx),
        );
        if (result instanceof Error) return result;

        await safeReply(ctx, texts.joinedGameAck());
      },
      finalizeSync,
    );
  });

  bot.command("whoami_config", async (ctx) => {
    const finalizeSync = createSyncFinalizer(
      ctx,
      logger,
      commandSync,
      ctx.from?.id ? String(ctx.from.id) : undefined,
    );
    await execute(
      ctx,
      logger,
      texts,
      async () => {
        if (!isGroupChat(ctx)) {
          return;
        }

        const result = await gameService.beginConfiguration(
          String(ctx.chat.id),
          String(ctx.from!.id),
        );
        if (result instanceof Error) return result;

        await safeReply(ctx, texts.configSentToCreatorAck());
      },
      finalizeSync,
    );
  });

  bot.command("whoami_cancel", async (ctx) => {
    const finalizeSync = createSyncFinalizer(
      ctx,
      logger,
      commandSync,
      ctx.from?.id ? String(ctx.from.id) : undefined,
    );
    await execute(
      ctx,
      logger,
      texts,
      async () => {
        if (!isGroupChat(ctx)) {
          return;
        }

        const result = await gameService.cancel(
          String(ctx.chat.id),
          String(ctx.from!.id),
        );
        if (result instanceof Error) return result;

        await safeReply(ctx, texts.gameCancelledAck());
      },
      finalizeSync,
    );
  });

  bot.command("giveup", async (ctx) => {
    const finalizeSync = createSyncFinalizer(
      ctx,
      logger,
      commandSync,
      ctx.from?.id ? String(ctx.from.id) : undefined,
    );
    await execute(
      ctx,
      logger,
      texts,
      async () => {
        if (!isGroupChat(ctx)) {
          return;
        }
        return gameService.giveUp(String(ctx.chat.id), String(ctx.from!.id));
      },
      finalizeSync,
    );
  });

  bot.command("ask", async (ctx) => {
    const finalizeSync = createSyncFinalizer(
      ctx,
      logger,
      commandSync,
      ctx.from?.id ? String(ctx.from.id) : undefined,
    );
    await execute(
      ctx,
      logger,
      texts,
      async () => {
        if (!isGroupChat(ctx)) {
          return;
        }
        return gameService.askOffline(
          String(ctx.chat.id),
          String(ctx.from!.id),
        );
      },
      finalizeSync,
    );
  });

  bot.on("message:text", async (ctx) => {
    const finalizeSync = createSyncFinalizer(
      ctx,
      logger,
      commandSync,
      ctx.from?.id ? String(ctx.from.id) : undefined,
    );
    await execute(
      ctx,
      logger,
      texts,
      async () => {
        const text = ctx.message.text.trim();
        if (text.startsWith("/")) {
          return;
        }

        if (isPrivate(ctx)) {
          return gameService.handlePrivateText(String(ctx.from.id), text);
        }
        if (isGroupChat(ctx)) {
          return gameService.handleGroupText(
            String(ctx.chat.id),
            String(ctx.from.id),
            text,
          );
        }
      },
      finalizeSync,
    );
  });

  bot.on("callback_query:data", async (ctx) => {
    const finalizeSync = createSyncFinalizer(
      ctx,
      logger,
      commandSync,
      ctx.from?.id ? String(ctx.from.id) : undefined,
    );
    await execute(
      ctx,
      logger,
      texts,
      async () => {
        const payload = ctx.callbackQuery.data;
        const fromUser = String(ctx.from.id);

        const parts = payload.split(":");
        if (parts[0] === "cfg") {
          const [, key, value, gameId] = parts;
          if (key === "play" && value === "ONLINE") {
            const status = await resolveGroupMessageReadStatus();
            if (status === "disabled") {
              await safeReply(ctx, texts.onlineModeDisabledMessage());
              await ctx.answerCallbackQuery({
                text: texts.onlineModeDisabledAlert(),
                show_alert: true,
              });
              return;
            }

            if (status === "unknown") {
              await safeReply(ctx, texts.onlineModeUnknownMessage());
              await ctx.answerCallbackQuery({
                text: texts.onlineModeUnknownAlert(),
                show_alert: true,
              });
              return;
            }
          }

          const result = await gameService.applyConfigStep(
            gameId,
            fromUser,
            key as "mode" | "play" | "pair",
            value,
          );
          if (result instanceof Error) return result;
          await ctx.answerCallbackQuery();
          return;
        }

        if (parts[0] === "pair") {
          const parsed = parseManualPairPayload(payload);
          if (parsed instanceof Error) return parsed;

          const result = await gameService.applyManualPair(
            parsed.gameId,
            fromUser,
            parsed.targetPlayerId,
          );
          if (result instanceof Error) return result;
          await ctx.answerCallbackQuery();
          return;
        }

        if (parts[0] === "word") {
          const [, action, value, gameId] = parts;
          const result = await gameService.handleWordCallback(
            gameId,
            fromUser,
            action as "confirm" | "clue" | "final",
            value as "YES" | "NO",
          );
          if (result instanceof Error) return result;
          await ctx.answerCallbackQuery();
          return;
        }

        if (parts[0] === "vote") {
          const [, value, gameId] = parts;
          const result = await gameService.handleVote(
            gameId,
            fromUser,
            value as "YES" | "NO" | "GUESSED",
          );
          if (result instanceof Error) return result;
          await ctx.answerCallbackQuery();
          return;
        }

        if (parts[0] === "ask") {
          if (ctx.chat) {
            const result = await gameService.askOffline(
              String(ctx.chat.id),
              fromUser,
            );
            if (result instanceof Error) return result;
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
